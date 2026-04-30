import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import session from "express-session";
import { bedrockRateLimiter } from "../../src/server/rateLimit";

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-that-is-long-enough-for-tests",
      resave: false,
      saveUninitialized: true,
    }),
  );

  app.use((req, _res, next) => {
    req.session.user = { email: "test@example.gov.uk", name: "Test" };
    next();
  });

  app.post("/test", bedrockRateLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("bedrockRateLimiter", () => {
  it("allows requests under the limit", async () => {
    const app = createTestApp();
    const res = await request(app).post("/test").send({});
    assert.equal(res.status, 200);
  });

  it("returns 429 after exceeding the limit", async () => {
    const app = createTestApp();
    const agent = request.agent(app);

    for (let i = 0; i < 30; i++) {
      await agent.post("/test").send({});
    }

    const res = await agent.post("/test").send({});
    assert.equal(res.status, 429);
  });
});
