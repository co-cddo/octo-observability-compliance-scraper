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

describe("logout endpoint", () => {
  it("POST /auth/logout requires CSRF token", async () => {
    const app = createApp(mockPool, mockPool, config);
    const res = await request(app).post("/auth/logout");
    assert.equal(res.status, 403);
  });
});
