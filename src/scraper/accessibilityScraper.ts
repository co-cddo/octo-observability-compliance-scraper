import { Browser } from "playwright";
import { Pool } from "pg";
import type { AccessibilityResult, AccessibilityResultInsert } from "../types";
import type { Config } from "../config";
import { newContext } from "./browser";
import { findDeeperStatementLink } from "./linkFinder";
import { detectBlock } from "./redirectDetector";
import { extractAccessibilityFromBedrock, extractMainText } from "./bedrock";
import { insertAccessibilityResult, getEffectiveUrl } from "../db/queries";

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normaliseOrganisation(org: string | string[]): string {
  return Array.isArray(org) ? org.join(", ") : org;
}

export type ServiceInfo = {
  name: string;
  slug: string;
  organisation: string;
  liveServiceUrl: string;
};

export async function scrapeAccessibility(
  service: ServiceInfo,
  browser: Browser,
  pool: Pool,
  config: Config,
): Promise<AccessibilityResult> {
  const base: Pick<
    AccessibilityResultInsert,
    "serviceName" | "serviceSlug" | "organisation" | "liveServiceUrl"
  > = {
    serviceName: service.name,
    serviceSlug: service.slug,
    organisation: service.organisation,
    liveServiceUrl: service.liveServiceUrl,
  };

  const empty: Omit<
    AccessibilityResultInsert,
    | "serviceName"
    | "serviceSlug"
    | "organisation"
    | "liveServiceUrl"
    | "scrapeStatus"
    | "errorMessage"
    | "accessibilityStatementUrl"
    | "rawBedrockResponse"
  > = {
    wcagStandard: null,
    complianceStatus: null,
    datePrepared: null,
    dateReviewed: null,
    dateTested: null,
    areasOfNonCompliance: [],
    remediationCommitments: [],
  };

  const effectiveUrl = await getEffectiveUrl(
    pool,
    service.slug,
    "accessibility",
  );
  if (!effectiveUrl) {
    return insertAccessibilityResult(pool, {
      ...base,
      ...empty,
      scrapeStatus: "no_link_found",
      errorMessage: null,
      accessibilityStatementUrl: null,
      rawBedrockResponse: null,
    });
  }

  const context = await newContext(browser);

  try {
    const page = await context.newPage();

    try {
      await page.goto(service.liveServiceUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.playwrightTimeout,
      });
    } catch {
      // session warm-up best-effort
    }

    let response: import("playwright").Response | null = null;
    try {
      response = await page.goto(effectiveUrl, {
        waitUntil: "networkidle",
        timeout: config.playwrightTimeout,
      });
    } catch {
      // proceed with whatever loaded
    }

    if (response && response.status() >= 400) {
      return insertAccessibilityResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "scrape_error",
        errorMessage: `HTTP ${response.status()} fetching accessibility statement`,
        accessibilityStatementUrl: effectiveUrl,
        rawBedrockResponse: null,
      });
    }

    const deeperLink = await findDeeperStatementLink(
      page,
      page.url(),
      "accessibility",
    );
    if (deeperLink) {
      let deeperResponse: import("playwright").Response | null = null;
      try {
        deeperResponse = await page.goto(deeperLink.href, {
          waitUntil: "networkidle",
          timeout: config.playwrightTimeout,
        });
      } catch {
        // proceed with whatever loaded
      }
      if (deeperResponse && deeperResponse.status() >= 400) {
        try {
          await page.goto(effectiveUrl, {
            waitUntil: "networkidle",
            timeout: config.playwrightTimeout,
          });
        } catch {
          // fall back to whatever loaded
        }
      }
    }

    const html = await page.content();
    const blockCheck = detectBlock(effectiveUrl, page.url(), html);
    if (blockCheck.blocked) {
      return insertAccessibilityResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "scrape_error",
        errorMessage: `Accessibility statement blocked: ${blockCheck.reason}`,
        accessibilityStatementUrl: effectiveUrl,
        rawBedrockResponse: null,
      });
    }

    let mainText = await extractMainText(page);
    if (mainText.trim().length === 0) {
      console.log(
        `[accessibility] ${service.name}: empty content on ${page.url()}, waiting for render...`,
      );
      try {
        await page.waitForFunction(
          () => {
            const el =
              document.querySelector("main") ??
              document.getElementById("main-content") ??
              document.querySelector('[role="main"]') ??
              document.body;
            return (el?.textContent?.trim()?.length ?? 0) > 100;
          },
          { timeout: 10000 },
        );
        mainText = await extractMainText(page);
      } catch {
        // content never appeared
      }
    }
    console.log(
      `[accessibility] ${service.name}: extracted ${mainText.trim().length} chars from ${page.url()}`,
    );

    if (mainText.trim().length === 0) {
      return insertAccessibilityResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "scrape_error",
        errorMessage:
          "Page inaccessible from scraper — returned empty content (possible WAF block)",
        accessibilityStatementUrl: page.url(),
        rawBedrockResponse: null,
      });
    }

    const bedrockResult = await extractAccessibilityFromBedrock(
      mainText,
      config,
    );

    if ("error" in bedrockResult) {
      return insertAccessibilityResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "bedrock_error",
        errorMessage: bedrockResult.error,
        accessibilityStatementUrl: page.url(),
        rawBedrockResponse: bedrockResult.rawResponse || null,
      });
    }

    const { extraction, rawResponse } = bedrockResult;
    const isEmpty = !extraction.isAccessibilityStatement;

    return insertAccessibilityResult(pool, {
      ...base,
      scrapeStatus: isEmpty ? "no_data_extracted" : "success",
      errorMessage: isEmpty
        ? "Page fetched but did not contain an accessibility statement"
        : null,
      accessibilityStatementUrl: page.url(),
      wcagStandard: extraction.wcagStandard,
      complianceStatus: extraction.complianceStatus,
      datePrepared: extraction.datePrepared,
      dateReviewed: extraction.dateReviewed,
      dateTested: extraction.dateTested,
      areasOfNonCompliance: extraction.areasOfNonCompliance,
      remediationCommitments: extraction.remediationCommitments,
      rawBedrockResponse: rawResponse,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return insertAccessibilityResult(pool, {
      ...base,
      ...empty,
      scrapeStatus: "scrape_error",
      errorMessage: message,
      accessibilityStatementUrl: null,
      rawBedrockResponse: null,
    });
  } finally {
    await context.close().catch(() => {});
  }
}
