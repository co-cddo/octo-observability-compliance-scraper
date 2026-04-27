import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(databaseUrl: string, nodeEnv?: string): Pool {
  if (!pool) {
    const isProduction = nodeEnv === "production";
    pool = new Pool({
      connectionString: databaseUrl,
      ...(isProduction ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

let readOnlyPool: Pool | null = null;

export function getReadOnlyPool(databaseUrl: string, nodeEnv?: string): Pool {
  if (!readOnlyPool) {
    const isProduction = nodeEnv === "production";
    readOnlyPool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      ...(isProduction ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    readOnlyPool.on("connect", (client) => {
      client.query(
        "SET statement_timeout = 10000; SET default_transaction_read_only = ON;",
      );
    });
  }
  return readOnlyPool;
}

export async function closePool(): Promise<void> {
  const pools: Promise<void>[] = [];
  if (pool) {
    pools.push(pool.end());
    pool = null;
  }
  if (readOnlyPool) {
    pools.push(readOnlyPool.end());
    readOnlyPool = null;
  }
  await Promise.all(pools);
}
