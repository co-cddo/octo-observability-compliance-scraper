CREATE TABLE IF NOT EXISTS services (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  organisation     TEXT NOT NULL,
  live_service_url TEXT NOT NULL,
  phase            TEXT,
  theme            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_slug ON services(slug);
