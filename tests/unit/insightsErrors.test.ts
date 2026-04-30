import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import session from "express-session";
import { insightsRouter } from "../../src/server/routes/insights";
import type { Pool } from "pg";
import type { Config } from "../../src/config";
import type { RequestHandler } from "express";

const config = {
  insightsModelId: "test",
  awsRegion: "eu-west-2",
} as Config;

const noOpRateLimiter: RequestHandler = (_req, _res, next) => next();

function buildApp(readOnlyPool: unknown): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "test-secret", resave: false, saveUninitialized: true }),
  );
  app.use(
    "/insights",
    insightsRouter(readOnlyPool as Pool, config, noOpRateLimiter),
  );
  return app;
}

describe("insights error responses", () => {
  it("500 response does not expose internal error message", async () => {
    const fakePool = { query: () => Promise.resolve({ rows: [] }) };
    const app = buildApp(fakePool);

    const res = await request(app)
      .post("/insights/ask")
      .send({ question: "show me services" });

    if (res.status === 500) {
      assert.ok(
        !res.body.error?.includes("credential"),
        "Response should not contain credential details",
      );
      assert.ok(
        !res.body.error?.includes("expired"),
        "Response should not contain expiry details",
      );
      assert.ok(
        !res.body.error?.includes("connection refused"),
        "Response should not contain connection details",
      );
      assert.equal(
        res.body.error,
        "An internal error occurred. Please try again later.",
        "500 responses should use a generic message",
      );
    }
  });

  it("returns generic error when question is empty", async () => {
    const fakePool = { query: () => Promise.resolve({ rows: [] }) };
    const app = buildApp(fakePool);

    const res = await request(app).post("/insights/ask").send({ question: "" });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Please enter a question.");
  });
});
