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
