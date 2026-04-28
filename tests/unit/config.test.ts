import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env["DATABASE_URL"] = "postgres://user:pass@localhost:5432/testdb";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadConfig(): Promise<
    ReturnType<typeof import("../../src/config").loadConfig>
  > {
    delete require.cache[require.resolve("../../src/config")];
    const { loadConfig: lc } = await import("../../src/config");
    return lc();
  }

  it("uses DATABASE_URL when provided", async () => {
    const config = await loadConfig();
    assert.equal(
      config.databaseUrl,
      "postgres://user:pass@localhost:5432/testdb",
    );
  });

  it("builds DATABASE_URL from component env vars", async () => {
    delete process.env["DATABASE_URL"];
    process.env["DATABASE_HOST"] = "db.example.com";
    process.env["DATABASE_PORT"] = "5433";
    process.env["DATABASE_USER"] = "admin";
    process.env["DATABASE_PASSWORD"] = "s3cret";
    process.env["DATABASE_NAME"] = "mydb";

    const config = await loadConfig();
    assert.equal(
      config.databaseUrl,
      "postgres://admin:s3cret@db.example.com:5433/mydb",
    );
  });

  it("throws when DATABASE_URL and components are missing", async () => {
    delete process.env["DATABASE_URL"];
    await assert.rejects(loadConfig, /Missing required database config/);
  });

  it("uses defaults for optional config", async () => {
    const config = await loadConfig();
    assert.equal(config.awsRegion, "eu-west-2");
    assert.equal(config.port, 3000);
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.ssoIssuer, "https://sso.service.security.gov.uk");
  });

  it("reads SSO_ISSUER from environment", async () => {
    process.env["SSO_ISSUER"] = "http://mock:8090/default";
    const config = await loadConfig();
    assert.equal(config.ssoIssuer, "http://mock:8090/default");
  });

  it("reads PORT from environment", async () => {
    process.env["PORT"] = "8080";
    const config = await loadConfig();
    assert.equal(config.port, 8080);
  });

  it("URL-encodes special characters in database credentials", async () => {
    delete process.env["DATABASE_URL"];
    process.env["DATABASE_HOST"] = "localhost";
    process.env["DATABASE_USER"] = "user@domain";
    process.env["DATABASE_PASSWORD"] = "p@ss:word";
    process.env["DATABASE_NAME"] = "db";

    const config = await loadConfig();
    assert.match(config.databaseUrl, /user%40domain/);
    assert.match(config.databaseUrl, /p%40ss%3Aword/);
  });
});
