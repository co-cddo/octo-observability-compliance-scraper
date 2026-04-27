import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "../config";
import { getPool, closePool } from "./client";

async function runMigrations(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config.databaseUrl, config.nodeEnv);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await pool.query<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  const appliedVersions = new Set(applied.rows.map((r) => r.version));

  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (appliedVersions.has(version)) {
      console.log(`[migrate] Skipping ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [version],
      );
      await client.query("COMMIT");
      console.log(`[migrate] Applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("[migrate] All migrations applied");
}

if (require.main === module) {
  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[migrate] Failed:", err);
      process.exit(1);
    });
}

export { runMigrations };
