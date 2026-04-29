import "dotenv/config";
import { loadConfig } from "./config";
import { getPool, getReadOnlyPool } from "./db/client";
import { createApp } from "./server/app";
import { discoverOidcEndpoints } from "./server/auth";
import { startWorker } from "./worker";

async function main(): Promise<void> {
  const config = loadConfig();

  await discoverOidcEndpoints(config.ssoIssuer);
  console.log(`[auth] OIDC discovery successful for ${config.ssoIssuer}`);

  const pool = getPool(config.databaseUrl, config.nodeEnv);
  const readOnlyPool = getReadOnlyPool(config.databaseUrl, config.nodeEnv);
  const app = createApp(pool, readOnlyPool, config);

  app.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port}`);
  });

  await startWorker();
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
