-- Accessibility results

CREATE TABLE IF NOT EXISTS accessibility_results (
  id                          SERIAL PRIMARY KEY,
  scraped_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  service_name                TEXT NOT NULL,
  service_slug                TEXT NOT NULL,
  organisation                TEXT NOT NULL,
  live_service_url            TEXT NOT NULL,

  scrape_status               TEXT NOT NULL
    CHECK (scrape_status IN ('success', 'no_link_found', 'scrape_error', 'bedrock_error', 'no_data_extracted')),
  accessibility_statement_url TEXT,
  error_message               TEXT,

  wcag_standard               TEXT,
  compliance_status           TEXT
    CHECK (compliance_status IN ('fully_compliant', 'partially_compliant', 'not_compliant')
      OR compliance_status IS NULL),
  date_prepared               TEXT,
  date_reviewed               TEXT,
  date_tested                 TEXT,
  areas_of_non_compliance     TEXT[] NOT NULL DEFAULT '{}',
  remediation_commitments     TEXT[] NOT NULL DEFAULT '{}',

  raw_bedrock_response        TEXT
);

CREATE INDEX IF NOT EXISTS idx_accessibility_results_slug
  ON accessibility_results(service_slug, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_accessibility_results_status
  ON accessibility_results(compliance_status);

CREATE INDEX IF NOT EXISTS idx_accessibility_results_organisation
  ON accessibility_results(organisation);

-- Cookie results

CREATE TABLE IF NOT EXISTS cookie_results (
  id                          SERIAL PRIMARY KEY,
  scraped_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_name                TEXT NOT NULL,
  service_slug                TEXT NOT NULL,
  organisation                TEXT NOT NULL,
  live_service_url            TEXT NOT NULL,
  scrape_status               TEXT NOT NULL
    CHECK (scrape_status IN ('success', 'no_link_found', 'scrape_error', 'bedrock_error', 'no_data_extracted')),
  cookie_policy_url           TEXT,
  error_message               TEXT,
  consent_mechanism_present   BOOLEAN,
  consent_framework           TEXT,
  analytics_tools             TEXT[] NOT NULL DEFAULT '{}',
  tracking_ids                JSONB NOT NULL DEFAULT '{}',
  cookies_listed              TEXT[] NOT NULL DEFAULT '{}',
  cookie_purposes             TEXT,
  raw_bedrock_response        TEXT
);

CREATE INDEX IF NOT EXISTS idx_cookie_results_slug
  ON cookie_results(service_slug, scraped_at DESC);

-- Privacy results

CREATE TABLE IF NOT EXISTS privacy_results (
  id                          SERIAL PRIMARY KEY,
  scraped_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_name                TEXT NOT NULL,
  service_slug                TEXT NOT NULL,
  organisation                TEXT NOT NULL,
  live_service_url            TEXT NOT NULL,
  scrape_status               TEXT NOT NULL
    CHECK (scrape_status IN ('success', 'no_link_found', 'scrape_error', 'bedrock_error', 'no_data_extracted')),
  privacy_policy_url          TEXT,
  error_message               TEXT,
  data_controllers            JSONB NOT NULL DEFAULT '[]',
  legal_basis                 TEXT,
  data_shared_with            TEXT[] NOT NULL DEFAULT '{}',
  retention_period            TEXT,
  last_updated_date           TEXT,
  raw_bedrock_response        TEXT
);

CREATE INDEX IF NOT EXISTS idx_privacy_results_slug
  ON privacy_results(service_slug, scraped_at DESC);

-- Compliance URLs

CREATE TABLE IF NOT EXISTS compliance_urls (
  id               SERIAL PRIMARY KEY,
  service_slug     TEXT NOT NULL,
  compliance_type  TEXT NOT NULL
    CHECK (compliance_type IN ('accessibility', 'cookies', 'privacy')),
  url              TEXT,
  source           TEXT NOT NULL
    CHECK (source IN ('discovered', 'manual')),
  status           TEXT NOT NULL
    CHECK (status IN ('found', 'not_found', 'auth_redirect', 'domain_mismatch',
                       'captcha_detected', 'geo_restricted', 'blocked_page', 'scrape_error')),
  changed_by_email TEXT,
  changed_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_urls_lookup
  ON compliance_urls(service_slug, compliance_type, created_at DESC);
