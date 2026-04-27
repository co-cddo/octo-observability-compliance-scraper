import { Pool } from "pg";
import type {
  AccessibilityResult,
  AccessibilityResultInsert,
  ComplianceStatus,
  ScrapeStatus,
  ComplianceLinkType,
  ComplianceUrl,
  ComplianceUrlInsert,
  CookieScrapeResult,
  CookieScrapeResultInsert,
  DataController,
  PrivacyScrapeResult,
  PrivacyScrapeResultInsert,
} from "../types";

// --- Accessibility Results ---

export async function insertAccessibilityResult(
  pool: Pool,
  row: AccessibilityResultInsert,
): Promise<AccessibilityResult> {
  const result = await pool.query<AccessibilityDbRow>(
    `INSERT INTO accessibility_results (
      service_name, service_slug, organisation, live_service_url,
      scrape_status, accessibility_statement_url, error_message,
      wcag_standard, compliance_status,
      date_prepared, date_reviewed, date_tested,
      areas_of_non_compliance, remediation_commitments,
      raw_bedrock_response
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    ) RETURNING *`,
    [
      row.serviceName,
      row.serviceSlug,
      row.organisation,
      row.liveServiceUrl,
      row.scrapeStatus,
      row.accessibilityStatementUrl,
      row.errorMessage,
      row.wcagStandard,
      row.complianceStatus,
      row.datePrepared,
      row.dateReviewed,
      row.dateTested,
      row.areasOfNonCompliance,
      row.remediationCommitments,
      row.rawBedrockResponse,
    ],
  );
  return toAccessibilityResult(result.rows[0]);
}

export type PaginatedAccessibilityResults = {
  results: AccessibilityResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getLatestAccessibilityResults(
  pool: Pool,
  filters: {
    status?: string;
    organisation?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedAccessibilityResults> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status === "unknown") {
    conditions.push(
      `(compliance_status IS NULL OR scrape_status = 'no_data_extracted')`,
    );
  } else if (filters.status) {
    params.push(filters.status);
    conditions.push(`compliance_status = $${params.length}`);
  }
  if (filters.organisation) {
    params.push(filters.organisation);
    conditions.push(`organisation = $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const baseQuery = `
    SELECT * FROM (
      SELECT DISTINCT ON (service_slug) *
      FROM accessibility_results
      ORDER BY service_slug, scraped_at DESC
    ) latest
    ${where}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM (${baseQuery}) counted`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const offset = (page - 1) * pageSize;

  params.push(pageSize);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const result = await pool.query<AccessibilityDbRow>(
    `${baseQuery} ORDER BY service_name ASC LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  return {
    results: result.rows.map(toAccessibilityResult),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getAccessibilityResultsBySlug(
  pool: Pool,
  slug: string,
): Promise<AccessibilityResult[]> {
  const result = await pool.query<AccessibilityDbRow>(
    `SELECT * FROM accessibility_results WHERE service_slug = $1 ORDER BY scraped_at DESC`,
    [slug],
  );
  return result.rows.map(toAccessibilityResult);
}

export async function getDistinctOrganisations(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ organisation: string }>(
    `SELECT DISTINCT organisation FROM accessibility_results ORDER BY organisation`,
  );
  return result.rows.map((r) => r.organisation);
}

// --- Compliance URLs ---

export async function insertComplianceUrl(
  pool: Pool,
  row: ComplianceUrlInsert,
): Promise<ComplianceUrl> {
  const result = await pool.query<ComplianceUrlDbRow>(
    `INSERT INTO compliance_urls (service_slug, compliance_type, url, source, status, changed_by_email, changed_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      row.serviceSlug,
      row.complianceType,
      row.url,
      row.source,
      row.status,
      row.changedByEmail,
      row.changedByName,
    ],
  );
  return toComplianceUrl(result.rows[0]);
}

export async function getEffectiveUrl(
  pool: Pool,
  slug: string,
  type: ComplianceLinkType,
): Promise<string | null> {
  const result = await pool.query<{ url: string | null }>(
    `SELECT url FROM compliance_urls
     WHERE service_slug = $1 AND compliance_type = $2 AND status = 'found'
     ORDER BY created_at DESC LIMIT 1`,
    [slug, type],
  );
  return result.rows[0]?.url ?? null;
}

export async function getEffectiveUrls(
  pool: Pool,
  slug: string,
): Promise<Record<ComplianceLinkType, ComplianceUrl | null>> {
  const result = await pool.query<ComplianceUrlDbRow>(
    `SELECT DISTINCT ON (compliance_type) *
     FROM compliance_urls
     WHERE service_slug = $1
     ORDER BY compliance_type, created_at DESC`,
    [slug],
  );

  const map: Record<ComplianceLinkType, ComplianceUrl | null> = {
    accessibility: null,
    cookies: null,
    privacy: null,
  };
  for (const row of result.rows) {
    map[row.compliance_type as ComplianceLinkType] = toComplianceUrl(row);
  }
  return map;
}

export async function getUrlHistory(
  pool: Pool,
  slug: string,
  type: ComplianceLinkType,
): Promise<ComplianceUrl[]> {
  const result = await pool.query<ComplianceUrlDbRow>(
    `SELECT * FROM compliance_urls
     WHERE service_slug = $1 AND compliance_type = $2
     ORDER BY created_at DESC`,
    [slug, type],
  );
  return result.rows.map(toComplianceUrl);
}

// --- Cookie Results ---

export async function insertCookieResult(
  pool: Pool,
  row: CookieScrapeResultInsert,
): Promise<CookieScrapeResult> {
  const result = await pool.query<CookieDbRow>(
    `INSERT INTO cookie_results (
      service_name, service_slug, organisation, live_service_url,
      scrape_status, cookie_policy_url, error_message,
      consent_mechanism_present, consent_framework, analytics_tools,
      tracking_ids, cookies_listed, cookie_purposes,
      raw_bedrock_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      row.serviceName,
      row.serviceSlug,
      row.organisation,
      row.liveServiceUrl,
      row.scrapeStatus,
      row.cookiePolicyUrl,
      row.errorMessage,
      row.consentMechanismPresent,
      row.consentFramework,
      row.analyticsTools,
      JSON.stringify(row.trackingIds),
      row.cookiesListed,
      row.cookiePurposes,
      row.rawBedrockResponse,
    ],
  );
  return toCookieScrapeResult(result.rows[0]);
}

export async function getCookieResultsBySlug(
  pool: Pool,
  slug: string,
): Promise<CookieScrapeResult[]> {
  const result = await pool.query<CookieDbRow>(
    `SELECT * FROM cookie_results WHERE service_slug = $1 ORDER BY scraped_at DESC`,
    [slug],
  );
  return result.rows.map(toCookieScrapeResult);
}

export type PaginatedCookieResults = {
  results: CookieScrapeResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getLatestCookieResults(
  pool: Pool,
  filters: { organisation?: string; page?: number; pageSize?: number },
): Promise<PaginatedCookieResults> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.organisation) {
    params.push(filters.organisation);
    conditions.push(`organisation = $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const baseQuery = `
    SELECT * FROM (
      SELECT DISTINCT ON (service_slug) *
      FROM cookie_results
      ORDER BY service_slug, scraped_at DESC
    ) latest ${where}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM (${baseQuery}) counted`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const offset = (page - 1) * pageSize;

  params.push(pageSize);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const result = await pool.query<CookieDbRow>(
    `${baseQuery} ORDER BY service_name ASC LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  return {
    results: result.rows.map(toCookieScrapeResult),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// --- Privacy Results ---

export async function insertPrivacyResult(
  pool: Pool,
  row: PrivacyScrapeResultInsert,
): Promise<PrivacyScrapeResult> {
  const result = await pool.query<PrivacyDbRow>(
    `INSERT INTO privacy_results (
      service_name, service_slug, organisation, live_service_url,
      scrape_status, privacy_policy_url, error_message,
      data_controllers, legal_basis, data_shared_with,
      retention_period, last_updated_date,
      raw_bedrock_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      row.serviceName,
      row.serviceSlug,
      row.organisation,
      row.liveServiceUrl,
      row.scrapeStatus,
      row.privacyPolicyUrl,
      row.errorMessage,
      JSON.stringify(row.dataControllers),
      row.legalBasis,
      row.dataSharedWith,
      row.retentionPeriod,
      row.lastUpdatedDate,
      row.rawBedrockResponse,
    ],
  );
  return toPrivacyScrapeResult(result.rows[0]);
}

export async function getPrivacyResultsBySlug(
  pool: Pool,
  slug: string,
): Promise<PrivacyScrapeResult[]> {
  const result = await pool.query<PrivacyDbRow>(
    `SELECT * FROM privacy_results WHERE service_slug = $1 ORDER BY scraped_at DESC`,
    [slug],
  );
  return result.rows.map(toPrivacyScrapeResult);
}

export type PaginatedPrivacyResults = {
  results: PrivacyScrapeResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getLatestPrivacyResults(
  pool: Pool,
  filters: { organisation?: string; page?: number; pageSize?: number },
): Promise<PaginatedPrivacyResults> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.organisation) {
    params.push(filters.organisation);
    conditions.push(`organisation = $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const baseQuery = `
    SELECT * FROM (
      SELECT DISTINCT ON (service_slug) *
      FROM privacy_results
      ORDER BY service_slug, scraped_at DESC
    ) latest ${where}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM (${baseQuery}) counted`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const offset = (page - 1) * pageSize;

  params.push(pageSize);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const result = await pool.query<PrivacyDbRow>(
    `${baseQuery} ORDER BY service_name ASC LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  return {
    results: result.rows.map(toPrivacyScrapeResult),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// --- Service lookup ---

export type ServiceRow = {
  name: string;
  slug: string;
  organisation: string;
  liveServiceUrl: string;
  phase: string | null;
  theme: string | null;
};

export async function getServiceBySlug(
  pool: Pool,
  slug: string,
): Promise<ServiceRow | null> {
  const result = await pool.query<{
    name: string;
    slug: string;
    organisation: string;
    live_service_url: string;
    phase: string | null;
    theme: string | null;
  }>(
    `SELECT name, slug, organisation, live_service_url, phase, theme FROM services WHERE slug = $1`,
    [slug],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    name: r.name,
    slug: r.slug,
    organisation: r.organisation,
    liveServiceUrl: r.live_service_url,
    phase: r.phase,
    theme: r.theme,
  };
}

// --- DB row types and mappers ---

type AccessibilityDbRow = {
  id: number;
  scraped_at: Date;
  service_name: string;
  service_slug: string;
  organisation: string;
  live_service_url: string;
  scrape_status: string;
  accessibility_statement_url: string | null;
  error_message: string | null;
  wcag_standard: string | null;
  compliance_status: string | null;
  date_prepared: string | null;
  date_reviewed: string | null;
  date_tested: string | null;
  areas_of_non_compliance: string[];
  remediation_commitments: string[];
  raw_bedrock_response: string | null;
};

function toAccessibilityResult(row: AccessibilityDbRow): AccessibilityResult {
  return {
    id: row.id,
    scrapedAt: row.scraped_at,
    serviceName: row.service_name,
    serviceSlug: row.service_slug,
    organisation: row.organisation,
    liveServiceUrl: row.live_service_url,
    scrapeStatus: row.scrape_status as ScrapeStatus,
    accessibilityStatementUrl: row.accessibility_statement_url,
    errorMessage: row.error_message,
    wcagStandard: row.wcag_standard,
    complianceStatus: row.compliance_status as ComplianceStatus | null,
    datePrepared: row.date_prepared,
    dateReviewed: row.date_reviewed,
    dateTested: row.date_tested,
    areasOfNonCompliance: row.areas_of_non_compliance,
    remediationCommitments: row.remediation_commitments,
    rawBedrockResponse: row.raw_bedrock_response,
  };
}

type ComplianceUrlDbRow = {
  id: number;
  service_slug: string;
  compliance_type: string;
  url: string | null;
  source: string;
  status: string;
  changed_by_email: string | null;
  changed_by_name: string | null;
  created_at: Date;
};

function toComplianceUrl(row: ComplianceUrlDbRow): ComplianceUrl {
  return {
    id: row.id,
    serviceSlug: row.service_slug,
    complianceType: row.compliance_type as ComplianceLinkType,
    url: row.url,
    source: row.source as "discovered" | "manual",
    status: row.status,
    changedByEmail: row.changed_by_email,
    changedByName: row.changed_by_name,
    createdAt: row.created_at,
  };
}

type CookieDbRow = {
  id: number;
  scraped_at: Date;
  service_name: string;
  service_slug: string;
  organisation: string;
  live_service_url: string;
  scrape_status: string;
  cookie_policy_url: string | null;
  error_message: string | null;
  consent_mechanism_present: boolean | null;
  consent_framework: string | null;
  analytics_tools: string[];
  tracking_ids: Record<string, string>;
  cookies_listed: string[];
  cookie_purposes: string | null;
  raw_bedrock_response: string | null;
};

function toCookieScrapeResult(row: CookieDbRow): CookieScrapeResult {
  return {
    id: row.id,
    scrapedAt: row.scraped_at,
    serviceName: row.service_name,
    serviceSlug: row.service_slug,
    organisation: row.organisation,
    liveServiceUrl: row.live_service_url,
    scrapeStatus: row.scrape_status as ScrapeStatus,
    cookiePolicyUrl: row.cookie_policy_url,
    errorMessage: row.error_message,
    consentMechanismPresent: row.consent_mechanism_present,
    consentFramework: row.consent_framework,
    analyticsTools: row.analytics_tools,
    trackingIds: row.tracking_ids ?? {},
    cookiesListed: row.cookies_listed,
    cookiePurposes: row.cookie_purposes,
    rawBedrockResponse: row.raw_bedrock_response,
  };
}

type PrivacyDbRow = {
  id: number;
  scraped_at: Date;
  service_name: string;
  service_slug: string;
  organisation: string;
  live_service_url: string;
  scrape_status: string;
  privacy_policy_url: string | null;
  error_message: string | null;
  data_controllers: DataController[];
  legal_basis: string | null;
  data_shared_with: string[];
  retention_period: string | null;
  last_updated_date: string | null;
  raw_bedrock_response: string | null;
};

function toPrivacyScrapeResult(row: PrivacyDbRow): PrivacyScrapeResult {
  return {
    id: row.id,
    scrapedAt: row.scraped_at,
    serviceName: row.service_name,
    serviceSlug: row.service_slug,
    organisation: row.organisation,
    liveServiceUrl: row.live_service_url,
    scrapeStatus: row.scrape_status as ScrapeStatus,
    privacyPolicyUrl: row.privacy_policy_url,
    errorMessage: row.error_message,
    dataControllers: Array.isArray(row.data_controllers)
      ? row.data_controllers
      : [],
    legalBasis: row.legal_basis,
    dataSharedWith: row.data_shared_with,
    retentionPeriod: row.retention_period,
    lastUpdatedDate: row.last_updated_date,
    rawBedrockResponse: row.raw_bedrock_response,
  };
}
