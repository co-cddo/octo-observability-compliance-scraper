export type ServiceInput = {
  name: string;
  organisation: string | string[];
  liveService: string | null;
  accessibilityPolicyUrl?: string | null;
  phase?: string;
  description?: string;
  theme?: string;
  [key: string]: unknown;
};

export type ComplianceLinkType = "accessibility" | "cookies" | "privacy";

export type ComplianceStatus =
  | "fully_compliant"
  | "partially_compliant"
  | "not_compliant";

export type ScrapeStatus =
  | "success"
  | "no_link_found"
  | "scrape_error"
  | "bedrock_error"
  | "no_data_extracted";

// --- Compliance URLs ---

export type ComplianceUrl = {
  id: number;
  serviceSlug: string;
  complianceType: ComplianceLinkType;
  url: string | null;
  source: "discovered" | "manual";
  status: string;
  changedByEmail: string | null;
  changedByName: string | null;
  createdAt: Date;
};

export type ComplianceUrlInsert = Omit<ComplianceUrl, "id" | "createdAt">;

// --- Accessibility ---

export type AccessibilityBedrockExtraction = {
  wcagStandard: string | null;
  complianceStatus: ComplianceStatus | null;
  datePrepared: string | null;
  dateReviewed: string | null;
  dateTested: string | null;
  areasOfNonCompliance: string[];
  remediationCommitments: string[];
};

export type AccessibilityResult = {
  id: number;
  scrapedAt: Date;
  serviceName: string;
  serviceSlug: string;
  organisation: string;
  liveServiceUrl: string;
  scrapeStatus: ScrapeStatus;
  accessibilityStatementUrl: string | null;
  errorMessage: string | null;
  wcagStandard: string | null;
  complianceStatus: ComplianceStatus | null;
  datePrepared: string | null;
  dateReviewed: string | null;
  dateTested: string | null;
  areasOfNonCompliance: string[];
  remediationCommitments: string[];
  rawBedrockResponse: string | null;
};

export type AccessibilityResultInsert = Omit<
  AccessibilityResult,
  "id" | "scrapedAt"
>;

// --- Cookies ---

export type CookieBedrockExtraction = {
  consentMechanismPresent: boolean | null;
  consentFramework: string | null;
  analyticsTools: string[];
  trackingIds: Record<string, string>;
  cookiesListed: string[];
  cookiePurposes: string | null;
};

export type CookieScrapeResult = {
  id: number;
  scrapedAt: Date;
  serviceName: string;
  serviceSlug: string;
  organisation: string;
  liveServiceUrl: string;
  scrapeStatus: ScrapeStatus;
  cookiePolicyUrl: string | null;
  errorMessage: string | null;
  consentMechanismPresent: boolean | null;
  consentFramework: string | null;
  analyticsTools: string[];
  trackingIds: Record<string, string>;
  cookiesListed: string[];
  cookiePurposes: string | null;
  rawBedrockResponse: string | null;
};

export type CookieScrapeResultInsert = Omit<
  CookieScrapeResult,
  "id" | "scrapedAt"
>;

// --- Privacy ---

export type DataController = {
  name: string;
  contact: string | null;
};

export type PrivacyBedrockExtraction = {
  dataControllers: DataController[];
  legalBasis: string | null;
  dataSharedWith: string[];
  retentionPeriod: string | null;
  lastUpdatedDate: string | null;
};

export type PrivacyScrapeResult = {
  id: number;
  scrapedAt: Date;
  serviceName: string;
  serviceSlug: string;
  organisation: string;
  liveServiceUrl: string;
  scrapeStatus: ScrapeStatus;
  privacyPolicyUrl: string | null;
  errorMessage: string | null;
  dataControllers: DataController[];
  legalBasis: string | null;
  dataSharedWith: string[];
  retentionPeriod: string | null;
  lastUpdatedDate: string | null;
  rawBedrockResponse: string | null;
};

export type PrivacyScrapeResultInsert = Omit<
  PrivacyScrapeResult,
  "id" | "scrapedAt"
>;
