export type BlockReason =
  | "auth_redirect"
  | "captcha_detected"
  | "domain_mismatch"
  | "geo_restricted"
  | "blocked_page";

export type RedirectCheckResult =
  | { blocked: false }
  | { blocked: true; reason: BlockReason };

const CAPTCHA_SIGNALS = [
  "g-recaptcha",
  "cf-challenge",
  "hcaptcha",
  "Checking if the site connection is secure",
  "Enable JavaScript and cookies to continue",
  "cf_clearance",
  "Just a moment",
];

const BLOCKED_PATH_PATTERNS = [
  "georestricted",
  "geo-restricted",
  "access-denied",
  "forbidden",
  "unavailable",
  "not-available",
  "blocked",
  "unauthorised",
  "unauthorized",
  "/signin",
  "/sign-in",
  "/login",
  "/log-in",
];

const GEO_CONTENT_SIGNALS = [
  "not available in your location",
  "not available in your region",
  "not available in your country",
  "geographically restricted",
  "geo-restricted",
  "this service is not available",
  "access this service from",
  "only available in the UK",
  "only available in the United Kingdom",
];

// Two-part TLDs where the registered domain sits at position -3, not -2.
const TWO_PART_TLDS = new Set([
  "gov.uk",
  "co.uk",
  "org.uk",
  "nhs.uk",
  "police.uk",
  "sch.uk",
  "ac.uk",
  "net.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "gov.scot",
  "gov.wales",
]);

function eTLDPlus1(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split(".");
    const twoPartTld = parts.slice(-2).join(".");
    const n = TWO_PART_TLDS.has(twoPartTld) ? 3 : 2;
    return parts.slice(-n).join(".");
  } catch {
    return null;
  }
}

export function detectBlock(
  requestedUrl: string,
  finalUrl: string,
  html: string,
): RedirectCheckResult {
  // CAPTCHA / Cloudflare challenge signals
  if (CAPTCHA_SIGNALS.some((s) => html.includes(s))) {
    return { blocked: true, reason: "captcha_detected" };
  }

  // Geo-restriction signals in page content
  const htmlLower = html.toLowerCase();
  if (GEO_CONTENT_SIGNALS.some((s) => htmlLower.includes(s))) {
    return { blocked: true, reason: "geo_restricted" };
  }

  // Domain mismatch — redirected off the original domain
  const requestedDomain = eTLDPlus1(requestedUrl);
  const finalDomain = eTLDPlus1(finalUrl);
  if (requestedDomain && finalDomain && requestedDomain !== finalDomain) {
    try {
      const finalHost = new URL(finalUrl).hostname;
      if (finalHost !== "www.gov.uk" && finalHost !== "gov.uk") {
        return { blocked: true, reason: "domain_mismatch" };
      }
    } catch {
      return { blocked: true, reason: "domain_mismatch" };
    }
  }

  // Blocked page URL patterns (geo-restriction, auth, etc.)
  try {
    const finalPath = new URL(finalUrl).pathname.toLowerCase();
    if (BLOCKED_PATH_PATTERNS.some((p) => finalPath.includes(p))) {
      return { blocked: true, reason: "blocked_page" };
    }
  } catch {
    // malformed URL — let it pass through
  }

  // Auth redirect — requested URL path had "access" but final doesn't
  try {
    const requestedPath = new URL(requestedUrl).pathname.toLowerCase();
    const finalPath = new URL(finalUrl).pathname.toLowerCase();
    if (
      requestedPath.includes("access") &&
      !finalPath.includes("access") &&
      requestedUrl !== finalUrl
    ) {
      return { blocked: true, reason: "auth_redirect" };
    }
  } catch {
    // malformed URL — let it pass through
  }

  return { blocked: false };
}
