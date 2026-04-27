import PgBoss from "pg-boss";
import type { Config } from "../config";

export function createBoss(config: Config): PgBoss {
  return new PgBoss({
    connectionString: config.databaseUrl,
    retentionDays: 14,
    archiveCompletedAfterSeconds: 86400,
    monitorStateIntervalSeconds: 30,
    ...(config.nodeEnv === "production"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });
}
