import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "../config";
import { getPool, closePool } from "./client";
import { toSlug } from "../scraper/accessibilityScraper";
import type { ServiceInput } from "../types";

function normaliseOrganisation(org: string | string[]): string {
  return Array.isArray(org) ? org.join(", ") : org;
}

async function seedServices(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config.databaseUrl, config.nodeEnv);

  const raw = fs.readFileSync(path.resolve(config.servicesJsonPath), "utf-8");
  const services: ServiceInput[] = JSON.parse(raw) as ServiceInput[];

  const withUrl = services.filter((s) => s.liveService != null);
  let upserted = 0;

  for (const service of withUrl) {
    const slug = toSlug(service.name);
    const organisation = normaliseOrganisation(service.organisation);

    await pool.query(
      `INSERT INTO services (name, slug, organisation, live_service_url, phase, theme)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         organisation = EXCLUDED.organisation,
         live_service_url = EXCLUDED.live_service_url,
         phase = EXCLUDED.phase,
         theme = EXCLUDED.theme`,
      [
        service.name,
        slug,
        organisation,
        service.liveService,
        service.phase ?? null,
        service.theme ?? null,
      ],
    );
    upserted++;
  }

  console.log(`[seed] Upserted ${upserted} services`);
}

if (require.main === module) {
  seedServices()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] Failed:", err);
      process.exit(1);
    });
}

export { seedServices };
