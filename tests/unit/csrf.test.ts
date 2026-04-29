import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import session from "express-session";
import { csrfSync } from "csrf-sync";

function buildCsrfApp(): express.Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );

  const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromRequest: (req) => {
      const body = req.body as Record<string, unknown> | undefined;
      if (body?._csrf) return body._csrf as string;
      return req.headers["x-csrf-token"] as string | undefined;
    },
  });

  app.use(csrfSynchronisedProtection);

  app.get("/", (req, res) => {
    const token = generateToken(req);
    res.send(`<meta name="csrf-token" content="${token}">`);
  });

  app.post("/action", (req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("CSRF protection", () => {
  it("rejects POST without CSRF token", async () => {
    const app = buildCsrfApp();
    const agent = request.agent(app);
    await agent.get("/");
    const res = await agent.post("/action");
    assert.equal(res.status, 403);
  });

  it("allows POST with valid CSRF token in body", async () => {
    const app = buildCsrfApp();
    const agent = request.agent(app);
    const getRes = await agent.get("/");
    const match = getRes.text.match(/content="([^"]+)"/);
    assert.ok(match, "Should have token in response");

    const res = await agent
      .post("/action")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(`_csrf=${encodeURIComponent(match[1])}`);
    assert.equal(res.status, 200);
  });

  it("allows POST with valid CSRF token in x-csrf-token header", async () => {
    const app = buildCsrfApp();
    const agent = request.agent(app);
    const getRes = await agent.get("/");
    const match = getRes.text.match(/content="([^"]+)"/);
    assert.ok(match, "Should have token in response");

    const res = await agent
      .post("/action")
      .set("Content-Type", "application/json")
      .set("x-csrf-token", match[1])
      .send(JSON.stringify({ data: "test" }));
    assert.equal(res.status, 200);
  });

  it("rejects POST with invalid CSRF token", async () => {
    const app = buildCsrfApp();
    const agent = request.agent(app);
    await agent.get("/");

    const res = await agent
      .post("/action")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("_csrf=invalid-token-value");
    assert.equal(res.status, 403);
  });
});
