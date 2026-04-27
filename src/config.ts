import "dotenv/config";

export type Config = {
  databaseUrl: string;
  awsRegion: string;
  bedrockModelId: string;
  insightsModelId: string;
  playwrightTimeout: number;
  concurrency: number;
  servicesJsonPath: string;
  port: number;
  nodeEnv: string;
  sessionSecret: string;
  ssoClientId: string;
  ssoClientSecret: string;
  ssoIssuer: string;
  appUrl: string;
};

function buildDatabaseUrl(): string {
  if (process.env["DATABASE_URL"]) {
    return process.env["DATABASE_URL"];
  }

  const host = process.env["DATABASE_HOST"];
  const port = process.env["DATABASE_PORT"] ?? "5432";
  const user = process.env["DATABASE_USER"];
  const password = process.env["DATABASE_PASSWORD"];
  const name = process.env["DATABASE_NAME"];

  if (!host || !user || !password || !name) {
    throw new Error(
      "Missing required database config: set DATABASE_URL or all of DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME",
    );
  }

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

export function loadConfig(): Config {
  return {
    databaseUrl: buildDatabaseUrl(),
    awsRegion: process.env["AWS_REGION"] ?? "eu-west-2",
    bedrockModelId:
      process.env["BEDROCK_MODEL_ID"] ??
      "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    insightsModelId:
      process.env["INSIGHTS_MODEL_ID"] ??
      "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    playwrightTimeout: parseInt(
      process.env["PLAYWRIGHT_TIMEOUT"] ?? "30000",
      10,
    ),
    concurrency: parseInt(process.env["SCRAPER_CONCURRENCY"] ?? "1", 10),
    servicesJsonPath: process.env["SERVICES_JSON_PATH"] ?? "./services.json",
    port: parseInt(process.env["PORT"] ?? "3000", 10),
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    sessionSecret: process.env["SESSION_SECRET"] ?? "dev-secret-change-me",
    ssoClientId: process.env["SSO_CLIENT_ID"] ?? "",
    ssoClientSecret: process.env["SSO_CLIENT_SECRET"] ?? "",
    ssoIssuer:
      process.env["SSO_ISSUER"] ?? "https://sso.service.security.gov.uk",
    appUrl:
      process.env["APP_URL"] ??
      `http://localhost:${process.env["PORT"] ?? "3000"}`,
  };
}
