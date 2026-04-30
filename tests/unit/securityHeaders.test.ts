import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/server/app";
import { Pool } from "pg";

const mockPool = {
  query: () => Promise.resolve({ rows: [] }),
} as unknown as Pool;

const config = {
  databaseUrl: "postgres://localhost/test",
  awsRegion: "eu-west-2",
  bedrockModelId: "test",
  insightsModelId: "test",
  playwrightTimeout: 30000,
  concurrency: 1,
  servicesJsonPath: "./services.json",
  port: 3000,
  nodeEnv: "production",
  sessionSecret: "a-very-long-secret-that-is-at-least-32-characters",
  ssoClientId: "test",
  ssoClientSecret: "test",
  ssoIssuer: "https://sso.example.com",
  appUrl: "http://localhost:3000",
};

describe("security headers", () => {
  it("sets Content-Security-Policy", async () => {
    const app = createApp(mockPool, mockPool, config);
    const res = await request(app).get("/health");
    assert.ok(
      res.headers["content-security-policy"],
      "Content-Security-Policy header should be present",
    );
  });

  it("sets Strict-Transport-Security", async () => {
    const app = createApp(mockPool, mockPool, config);
    const res = await request(app).get("/health");
    assert.ok(
      res.headers["strict-transport-security"],
      "Strict-Transport-Security header should be present",
    );
  });

  it("sets X-Content-Type-Options", async () => {
    const app = createApp(mockPool, mockPool, config);
    const res = await request(app).get("/health");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });

  it("sets X-Frame-Options", async () => {
    const app = createApp(mockPool, mockPool, config);
    const res = await request(app).get("/health");
    assert.ok(
      res.headers["x-frame-options"],
      "X-Frame-Options header should be present",
    );
  });

  it("sets Referrer-Policy", async () => {
    const app = createApp(mockPool, mockPool, config);
    const res = await request(app).get("/health");
    assert.ok(
      res.headers["referrer-policy"],
      "Referrer-Policy header should be present",
    );
  });

  it("does not expose X-Powered-By", async () => {
    const app = createApp(mockPool, mockPool, config);
    const res = await request(app).get("/health");
    assert.equal(res.headers["x-powered-by"], undefined);
  });
});
