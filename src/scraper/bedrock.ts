import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  AccessibilityBedrockExtraction,
  ComplianceStatus,
  CookieBedrockExtraction,
  DataController,
  PrivacyBedrockExtraction,
} from "../types";
import type { Config } from "../config";

const HTML_CAP = 80_000;

type BedrockSuccess<T> = { extraction: T; rawResponse: string };
type BedrockFailure = { error: string; rawResponse: string };

async function callBedrock(
  systemPrompt: string,
  userContent: string,
  config: Pick<Config, "bedrockModelId" | "awsRegion">,
): Promise<{ text: string; rawResponse: string }> {
  const client = new BedrockRuntimeClient({ region: config.awsRegion });

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const command = new InvokeModelCommand({
    modelId: config.bedrockModelId,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  const response = await client.send(command);
  const rawResponse = new TextDecoder().decode(response.body);

  const parsed = JSON.parse(rawResponse) as {
    content: Array<{ type: string; text: string }>;
  };

  const rawText = parsed.content?.[0]?.text ?? "";
  const text = rawText
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  return { text, rawResponse };
}

function checkCredentialError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (
    name === "ExpiredTokenException" ||
    name === "UnrecognizedClientException" ||
    message.includes("security token") ||
    message.includes("session has expired") ||
    message.includes("reauthenticate")
  ) {
    throw new Error(`AWS credentials are expired or invalid. (${message})`);
  }
}

// --- Accessibility ---

const ACCESSIBILITY_SYSTEM = `You are an expert at extracting structured compliance information from UK government accessibility statements.
You will receive the HTML content of an accessibility statement page.
Extract the requested fields and respond with a single valid JSON object — no markdown, no prose, no code fences.
If a field cannot be determined from the page, use null for strings or [] for arrays.`;

const ACCESSIBILITY_USER = `Extract the following fields from this accessibility statement HTML:

1. wcagStandard — The WCAG version and level tested against. Use the format "WCAG X.X AA" (no "level" word), e.g. "WCAG 2.2 AA" or "WCAG 2.1 AA". Null if not stated.
2. complianceStatus — One of exactly: "fully_compliant", "partially_compliant", "not_compliant". Null if not determinable.
3. datePrepared — Date the statement was first prepared or published. Use the text as written on the page.
4. dateReviewed — Date the statement was last reviewed or updated.
5. dateTested — Date the service was last tested for accessibility.
6. areasOfNonCompliance — Array of strings describing each specific area where the service does not meet WCAG. Empty array if none stated or if fully compliant.
7. remediationCommitments — Array of strings describing commitments made to fix accessibility issues, with dates if mentioned. Empty array if none.

Respond with ONLY a JSON object matching this schema:
{
  "wcagStandard": string | null,
  "complianceStatus": "fully_compliant" | "partially_compliant" | "not_compliant" | null,
  "datePrepared": string | null,
  "dateReviewed": string | null,
  "dateTested": string | null,
  "areasOfNonCompliance": string[],
  "remediationCommitments": string[]
}

HTML:
`;

export async function extractAccessibilityFromBedrock(
  html: string,
  config: Pick<Config, "bedrockModelId" | "awsRegion">,
): Promise<BedrockSuccess<AccessibilityBedrockExtraction> | BedrockFailure> {
  let rawResponse = "";
  try {
    const result = await callBedrock(
      ACCESSIBILITY_SYSTEM,
      ACCESSIBILITY_USER + html.slice(0, HTML_CAP),
      config,
    );
    rawResponse = result.rawResponse;
    const data = JSON.parse(result.text) as Record<string, unknown>;

    return {
      extraction: {
        wcagStandard: (data["wcagStandard"] as string | null) ?? null,
        complianceStatus:
          (data["complianceStatus"] as ComplianceStatus | null) ?? null,
        datePrepared: (data["datePrepared"] as string | null) ?? null,
        dateReviewed: (data["dateReviewed"] as string | null) ?? null,
        dateTested: (data["dateTested"] as string | null) ?? null,
        areasOfNonCompliance: Array.isArray(data["areasOfNonCompliance"])
          ? (data["areasOfNonCompliance"] as string[])
          : [],
        remediationCommitments: Array.isArray(data["remediationCommitments"])
          ? (data["remediationCommitments"] as string[])
          : [],
      },
      rawResponse,
    };
  } catch (err) {
    checkCredentialError(err);
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, rawResponse };
  }
}

// backward compat alias
export const extractFromBedrock = extractAccessibilityFromBedrock;

// --- Cookies ---

const COOKIE_SYSTEM = `You are an expert at analysing UK government website cookie policies and consent mechanisms.
You will receive Set-Cookie HTTP headers and the full HTML of a cookie policy page (including any consent banners).
Extract the requested fields and respond with a single valid JSON object — no markdown, no prose, no code fences.
If a field cannot be determined, use null for strings, false for booleans, [] for arrays, or {} for objects.`;

const COOKIE_USER = `Analyse the following Set-Cookie headers and page HTML.

Extract:
1. consentMechanismPresent — true if the page or site has a cookie consent banner or mechanism, false otherwise.
2. consentFramework — Name of the consent framework if identifiable (e.g. "GOV.UK", "OneTrust", "Cookiebot", "CookieYes", "Civic Cookie Control", "generic"). Null if none.
3. analyticsTools — Array of analytics/tracking tools detected (e.g. "google_analytics", "google_tag_manager", "hotjar", "dynatrace", "facebook_pixel", "microsoft_clarity", "new_relic", "mixpanel", "linkedin", "adobe_analytics").
4. trackingIds — Object of tracking IDs found, with keys like "ga_property", "gtm_id", "dynatrace_id", "hotjar_id" and any others. Empty object if none.
5. cookiesListed — Array of cookie names explicitly listed in the policy page.
6. cookiePurposes — Brief summary of what purposes cookies are used for, as stated in the policy. Null if not stated.

Respond with ONLY a JSON object matching this schema:
{
  "consentMechanismPresent": boolean | null,
  "consentFramework": string | null,
  "analyticsTools": string[],
  "trackingIds": { [key: string]: string },
  "cookiesListed": string[],
  "cookiePurposes": string | null
}

Set-Cookie headers:
`;

export async function extractCookiesFromBedrock(
  html: string,
  setCookieHeaders: string[],
  config: Pick<Config, "bedrockModelId" | "awsRegion">,
): Promise<BedrockSuccess<CookieBedrockExtraction> | BedrockFailure> {
  let rawResponse = "";
  try {
    const headersBlock =
      setCookieHeaders.length > 0 ? setCookieHeaders.join("\n") : "(none)";
    const userContent =
      COOKIE_USER + headersBlock + "\n\nHTML:\n" + html.slice(0, HTML_CAP);

    const result = await callBedrock(COOKIE_SYSTEM, userContent, config);
    rawResponse = result.rawResponse;
    const data = JSON.parse(result.text) as Record<string, unknown>;

    return {
      extraction: {
        consentMechanismPresent:
          typeof data["consentMechanismPresent"] === "boolean"
            ? data["consentMechanismPresent"]
            : null,
        consentFramework: (data["consentFramework"] as string | null) ?? null,
        analyticsTools: Array.isArray(data["analyticsTools"])
          ? (data["analyticsTools"] as string[])
          : [],
        trackingIds:
          typeof data["trackingIds"] === "object" &&
          data["trackingIds"] !== null &&
          !Array.isArray(data["trackingIds"])
            ? (data["trackingIds"] as Record<string, string>)
            : {},
        cookiesListed: Array.isArray(data["cookiesListed"])
          ? (data["cookiesListed"] as string[])
          : [],
        cookiePurposes: (data["cookiePurposes"] as string | null) ?? null,
      },
      rawResponse,
    };
  } catch (err) {
    checkCredentialError(err);
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, rawResponse };
  }
}

// --- Privacy ---

const PRIVACY_SYSTEM = `You are an expert at analysing UK government privacy notices and data protection policies.
You will receive the HTML content of a privacy notice or privacy policy page.
Extract the requested fields and respond with a single valid JSON object — no markdown, no prose, no code fences.
If a field cannot be determined, use null for strings or [] for arrays.
Note: there may be more than one data controller — return all of them.`;

const PRIVACY_USER = `Extract the following fields from this privacy notice HTML:

1. dataControllers — Array of data controllers. Each has a "name" (string) and "contact" (string or null, e.g. email, postal address, or DPO contact). Return all controllers mentioned.
2. legalBasis — The legal basis for data processing (e.g. "public task", "legitimate interests", "consent", "legal obligation"). Null if not stated.
3. dataSharedWith — Array of organisations or categories of organisations that personal data is shared with. Empty array if none stated.
4. retentionPeriod — How long personal data is retained, as stated on the page. Null if not stated.
5. lastUpdatedDate — Date the privacy notice was last updated. Use the text as written on the page. Null if not stated.

Respond with ONLY a JSON object matching this schema:
{
  "dataControllers": [{ "name": string, "contact": string | null }],
  "legalBasis": string | null,
  "dataSharedWith": string[],
  "retentionPeriod": string | null,
  "lastUpdatedDate": string | null
}

HTML:
`;

export async function extractPrivacyFromBedrock(
  html: string,
  config: Pick<Config, "bedrockModelId" | "awsRegion">,
): Promise<BedrockSuccess<PrivacyBedrockExtraction> | BedrockFailure> {
  let rawResponse = "";
  try {
    const result = await callBedrock(
      PRIVACY_SYSTEM,
      PRIVACY_USER + html.slice(0, HTML_CAP),
      config,
    );
    rawResponse = result.rawResponse;
    const data = JSON.parse(result.text) as Record<string, unknown>;

    const rawControllers = Array.isArray(data["dataControllers"])
      ? data["dataControllers"]
      : [];
    const dataControllers: DataController[] = rawControllers.map(
      (c: unknown) => {
        const obj = c as Record<string, unknown>;
        return {
          name: (obj["name"] as string) ?? "Unknown",
          contact: (obj["contact"] as string | null) ?? null,
        };
      },
    );

    return {
      extraction: {
        dataControllers,
        legalBasis: (data["legalBasis"] as string | null) ?? null,
        dataSharedWith: Array.isArray(data["dataSharedWith"])
          ? (data["dataSharedWith"] as string[])
          : [],
        retentionPeriod: (data["retentionPeriod"] as string | null) ?? null,
        lastUpdatedDate: (data["lastUpdatedDate"] as string | null) ?? null,
      },
      rawResponse,
    };
  } catch (err) {
    checkCredentialError(err);
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, rawResponse };
  }
}

// --- Utilities ---

export async function extractMainHtml(
  page: import("playwright").Page,
): Promise<string> {
  return page.evaluate((): string => {
    const main =
      document.querySelector("main") ??
      document.getElementById("main-content") ??
      document.querySelector('[role="main"]') ??
      document.body;
    return main?.innerHTML ?? "";
  });
}

export async function extractFullHtml(
  page: import("playwright").Page,
): Promise<string> {
  return page.evaluate((): string => {
    return document.documentElement.outerHTML;
  });
}
