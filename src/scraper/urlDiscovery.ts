import { Browser } from "playwright";
import { Pool } from "pg";
import type { ComplianceLinkType } from "../types";
import type { Config } from "../config";
import { newContext } from "./browser";
import { findComplianceLink } from "./linkFinder";
import { detectBlock, BlockReason } from "./redirectDetector";

const COMPLIANCE_TYPES: ComplianceLinkType[] = [
  "accessibility",
  "cookies",
  "privacy",
];

type DiscoveryResult = {
  type: ComplianceLinkType;
  url: string | null;
  status: string;
};

function blockReasonToStatus(reason: BlockReason): string {
  return reason;
}

async function getManualOverrides(
  pool: Pool,
  slug: string,
): Promise<Map<ComplianceLinkType, string>> {
  const result = await pool.query<{
    compliance_type: string;
    url: string;
  }>(
    `SELECT DISTINCT ON (compliance_type) compliance_type, url
     FROM compliance_urls
     WHERE service_slug = $1 AND source = 'manual' AND url IS NOT NULL
     ORDER BY compliance_type, created_at DESC`,
    [slug],
  );
  const overrides = new Map<ComplianceLinkType, string>();
  for (const row of result.rows) {
    overrides.set(row.compliance_type as ComplianceLinkType, row.url);
  }
  return overrides;
}

export async function discoverUrls(
  serviceSlug: string,
  liveServiceUrl: string,
  browser: Browser,
  pool: Pool,
  config: Config,
): Promise<DiscoveryResult[]> {
  const overrides = await getManualOverrides(pool, serviceSlug);
  const results: DiscoveryResult[] = [];
  const typesToDiscover = COMPLIANCE_TYPES.filter((t) => !overrides.has(t));

  for (const [type, url] of overrides) {
    results.push({ type, url, status: "found" });
  }

  if (typesToDiscover.length === 0) {
    return results;
  }

  const context = await newContext(browser);

  try {
    const page = await context.newPage();

    console.log(
      `[urlDiscovery] ${serviceSlug} — navigating to ${liveServiceUrl}`,
    );
    try {
      await page.goto(liveServiceUrl, {
        waitUntil: "networkidle",
        timeout: config.playwrightTimeout,
      });
      console.log(
        `[urlDiscovery] ${serviceSlug} — goto ok, landed on ${page.url()}`,
      );
    } catch (gotoErr) {
      const gotoMsg =
        gotoErr instanceof Error ? gotoErr.message : String(gotoErr);
      console.log(
        `[urlDiscovery] ${serviceSlug} — goto threw (${gotoMsg.split("\n")[0]}), proceeding from ${page.url()}`,
      );
    }

    const html = await page.content();
    console.log(
      `[urlDiscovery] ${serviceSlug} — html[:500]: ${html.slice(0, 500).replace(/\s+/g, " ")}`,
    );
    const blockCheck = detectBlock(liveServiceUrl, page.url(), html);

    if (blockCheck.blocked) {
      const status = blockReasonToStatus(blockCheck.reason);
      for (const type of typesToDiscover) {
        await pool.query(
          `INSERT INTO compliance_urls (service_slug, compliance_type, url, source, status)
           VALUES ($1, $2, NULL, 'discovered', $3)`,
          [serviceSlug, type, status],
        );
        results.push({ type, url: null, status });
      }
      return results;
    }

    for (const type of typesToDiscover) {
      const link = await findComplianceLink(page, page.url(), type);
      const url = link?.href ?? null;
      const status = url ? "found" : "not_found";

      await pool.query(
        `INSERT INTO compliance_urls (service_slug, compliance_type, url, source, status)
         VALUES ($1, $2, $3, 'discovered', $4)`,
        [serviceSlug, type, url, status],
      );
      results.push({ type, url, status });
    }

    return results;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Browser or page was closed mid-navigation — record scrape_error for undiscovered types
    for (const type of typesToDiscover) {
      if (!results.find((r) => r.type === type)) {
        await pool
          .query(
            `INSERT INTO compliance_urls (service_slug, compliance_type, url, source, status)
           VALUES ($1, $2, NULL, 'discovered', 'scrape_error')`,
            [serviceSlug, type],
          )
          .catch(() => {});
        results.push({ type, url: null, status: "scrape_error" });
      }
    }
    console.error(
      `[urlDiscovery] Browser error for ${serviceSlug}: ${message}`,
    );
    return results;
  } finally {
    await context.close().catch(() => {});
  }
}
