import { Browser } from "playwright";
import { Pool } from "pg";
import type { CookieScrapeResult, CookieScrapeResultInsert } from "../types";
import type { Config } from "../config";
import { newContext } from "./browser";
import { findDeeperStatementLink } from "./linkFinder";
import { detectBlock } from "./redirectDetector";
import { extractCookiesFromBedrock, extractFullText } from "./bedrock";
import { insertCookieResult, getEffectiveUrl } from "../db/queries";
import type { ServiceInfo } from "./accessibilityScraper";

export async function scrapeCookies(
  service: ServiceInfo,
  browser: Browser,
  pool: Pool,
  config: Config,
): Promise<CookieScrapeResult> {
  const base: Pick<
    CookieScrapeResultInsert,
    "serviceName" | "serviceSlug" | "organisation" | "liveServiceUrl"
  > = {
    serviceName: service.name,
    serviceSlug: service.slug,
    organisation: service.organisation,
    liveServiceUrl: service.liveServiceUrl,
  };

  const empty: Pick<
    CookieScrapeResultInsert,
    | "consentMechanismPresent"
    | "consentFramework"
    | "analyticsTools"
    | "trackingIds"
    | "cookiesListed"
    | "cookiePurposes"
  > = {
    consentMechanismPresent: null,
    consentFramework: null,
    analyticsTools: [],
    trackingIds: {},
    cookiesListed: [],
    cookiePurposes: null,
  };

  const effectiveUrl = await getEffectiveUrl(pool, service.slug, "cookies");
  if (!effectiveUrl) {
    return insertCookieResult(pool, {
      ...base,
      ...empty,
      scrapeStatus: "no_link_found",
      errorMessage: null,
      cookiePolicyUrl: null,
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

    const setCookieHeaders: string[] = [];
    page.on("response", (response) => {
      const headers = response.headers();
      const setCookie = headers["set-cookie"];
      if (setCookie) {
        setCookieHeaders.push(...setCookie.split("\n"));
      }
    });

    try {
      await page.goto(effectiveUrl, {
        waitUntil: "networkidle",
        timeout: config.playwrightTimeout,
      });
    } catch {
      // proceed with whatever loaded
    }

    const deeperLink = await findDeeperStatementLink(
      page,
      page.url(),
      "cookies",
    );
    if (deeperLink) {
      try {
        await page.goto(deeperLink.href, {
          waitUntil: "networkidle",
          timeout: config.playwrightTimeout,
        });
      } catch {
        // proceed with whatever loaded
      }
    }

    const html = await page.content();
    const blockCheck = detectBlock(effectiveUrl, page.url(), html);
    if (blockCheck.blocked) {
      return insertCookieResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "scrape_error",
        errorMessage: `Cookie policy page blocked: ${blockCheck.reason}`,
        cookiePolicyUrl: effectiveUrl,
        rawBedrockResponse: null,
      });
    }

    const fullText = await extractFullText(page);
    const bedrockResult = await extractCookiesFromBedrock(
      fullText,
      setCookieHeaders,
      config,
    );

    if ("error" in bedrockResult) {
      return insertCookieResult(pool, {
        ...base,
        ...empty,
        scrapeStatus: "bedrock_error",
        errorMessage: bedrockResult.error,
        cookiePolicyUrl: page.url(),
        rawBedrockResponse: bedrockResult.rawResponse || null,
      });
    }

    const { extraction, rawResponse } = bedrockResult;
    const isEmpty =
      extraction.consentMechanismPresent === null &&
      extraction.analyticsTools.length === 0 &&
      extraction.cookiesListed.length === 0;

    return insertCookieResult(pool, {
      ...base,
      scrapeStatus: isEmpty ? "no_data_extracted" : "success",
      errorMessage: isEmpty
        ? "Page fetched but did not contain a cookie policy"
        : null,
      cookiePolicyUrl: page.url(),
      consentMechanismPresent: extraction.consentMechanismPresent,
      consentFramework: extraction.consentFramework,
      analyticsTools: extraction.analyticsTools,
      trackingIds: extraction.trackingIds,
      cookiesListed: extraction.cookiesListed,
      cookiePurposes: extraction.cookiePurposes,
      rawBedrockResponse: rawResponse,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return insertCookieResult(pool, {
      ...base,
      ...empty,
      scrapeStatus: "scrape_error",
      errorMessage: message,
      cookiePolicyUrl: null,
      rawBedrockResponse: null,
    });
  } finally {
    await context.close().catch(() => {});
  }
}
