import { loadConfig } from "../config";
import { getPool, getReadOnlyPool } from "../db/client";
import { createApp } from "./app";

const config = loadConfig();
const pool = getPool(config.databaseUrl, config.nodeEnv);
const readOnlyPool = getReadOnlyPool(config.databaseUrl, config.nodeEnv);
const app = createApp(pool, readOnlyPool, config);

app.listen(config.port, () => {
  console.log(
    `Compliance scraper UI listening on http://localhost:${config.port}`,
  );
});
