import { Browser } from "playwright";
import { Pool } from "pg";
import type { PrivacyScrapeResult, PrivacyScrapeResultInsert } from "../types";
import type { Config } from "../config";
import { newContext } from "./browser";
import { findDeeperStatementLink } from "./linkFinder";
import { detectBlock } from "./redirectDetector";
import { extractPrivacyFromBedrock, extractMainText } from "./bedrock";
import { insertPrivacyResult, getEffectiveUrl } from "../db/queries";
import type { ServiceInfo } from "./accessibilityScraper";

export async function scrapePrivacy(
  service: ServiceInfo,
  browser: Browser,
  pool: Pool,
  config: Config,
): Promise<PrivacyScrapeResult> {
  const base: Pick<
    PrivacyScrapeResultInsert,
    "serviceName" | "serviceSlug" | "organisation" | "liveServiceUrl"
  > = {
    serviceName: service.name,
    serviceSlug: service.slug,
    organisation: service.organisation,
    liveServiceUrl: service.liveServiceUrl,
  };

  const empty: Pick<
    PrivacyScrapeResultInsert,
    | "dataControllers"
    | "legalBasis"
    | "dataSharedWith"
    | "retentionPeriod"
    | "lastUpdatedDate"
  > = {
    dataControllers: [],
    legalBasis: null,
    dataSharedWith: [],
    retentionPeriod: null,
    lastUpdatedDate: null,
  };

  const effectiveUrl = await getEffectiveUrl(pool, service.slug, "privacy");
  if (!effectiveUrl) {
    return insertPrivacyResult(pool, {
      ...base,
      ...empty,
      scrapeStatus: "no_link_found",
      errorMessage: null,
      privacyPolicyUrl: null,
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
      return insertPrivacyResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "scrape_error",
        errorMessage: `HTTP ${response.status()} fetching privacy notice`,
        privacyPolicyUrl: effectiveUrl,
        rawBedrockResponse: null,
      });
    }

    const deeperLink = await findDeeperStatementLink(
      page,
      page.url(),
      "privacy",
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
      return insertPrivacyResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "scrape_error",
        errorMessage: `Privacy policy page blocked: ${blockCheck.reason}`,
        privacyPolicyUrl: effectiveUrl,
        rawBedrockResponse: null,
      });
    }

    let mainText = await extractMainText(page);
    if (mainText.length === 0) {
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
      `[privacy] ${service.name}: extracted ${mainText.length} chars`,
    );
    const bedrockResult = await extractPrivacyFromBedrock(mainText, config);

    if ("error" in bedrockResult) {
      return insertPrivacyResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "bedrock_error",
        errorMessage: bedrockResult.error,
        privacyPolicyUrl: page.url(),
        rawBedrockResponse: bedrockResult.rawResponse || null,
      });
    }

    const { extraction, rawResponse } = bedrockResult;
    const isEmpty =
      extraction.dataControllers.length === 0 && !extraction.legalBasis;

    return insertPrivacyResult(pool, {
      ...base,
      scrapeStatus: isEmpty ? "no_data_extracted" : "success",
      errorMessage: isEmpty
        ? "Page fetched but did not contain a privacy notice"
        : null,
      privacyPolicyUrl: page.url(),
      dataControllers: extraction.dataControllers,
      legalBasis: extraction.legalBasis,
      dataSharedWith: extraction.dataSharedWith,
      retentionPeriod: extraction.retentionPeriod,
      lastUpdatedDate: extraction.lastUpdatedDate,
      rawBedrockResponse: rawResponse,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return insertPrivacyResult(pool, {
      ...base,
      ...empty,
      scrapeStatus: "scrape_error",
      errorMessage: message,
      privacyPolicyUrl: null,
      rawBedrockResponse: null,
    });
  } finally {
    await context.close().catch(() => {});
  }
}
