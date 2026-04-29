import express, { Express } from "express";
import * as crypto from "crypto";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { csrfSync } from "csrf-sync";
import nunjucks from "nunjucks";
import * as path from "path";
import { Pool } from "pg";
import type { Config } from "../config";
import { accessibilityRouter } from "./routes/accessibility";
import { cookiesRouter } from "./routes/cookies";
import { privacyRouter } from "./routes/privacy";
import { insightsRouter } from "./routes/insights";
import { workersRouter } from "./routes/workers";
import { serviceRouter } from "./routes/service";
import { authRouter, requireAuth } from "./auth";
import { bedrockRateLimiter } from "./rateLimit";
import { getBoss, SCHEDULE_CRON_NAME } from "../worker";
import "./sessionTypes";

export function createApp(
  pool: Pool,
  readOnlyPool: Pool,
  config: Config,
): Express {
  const app = express();
  app.set("trust proxy", 1);

  app.use((_req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            (_req, res) =>
              `'nonce-${(res as express.Response).locals.cspNonce}'`,
          ],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  const viewsDir = path.join(__dirname, "views");
  const govukMacrosDir = path.join(
    __dirname,
    "../../node_modules/govuk-frontend/dist",
  );

  const njkEnv = nunjucks.configure([viewsDir, govukMacrosDir], {
    autoescape: true,
    express: app,
  });

  app.set("view engine", "njk");

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(express.static(path.join(__dirname, "static")));

  app.use(
    "/public",
    express.static(
      path.join(__dirname, "../../node_modules/govuk-frontend/dist/govuk"),
    ),
  );

  app.use(
    "/assets",
    express.static(
      path.join(
        __dirname,
        "../../node_modules/govuk-frontend/dist/govuk/assets",
      ),
    ),
  );

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: config.nodeEnv === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 2 * 60 * 60 * 1000,
      },
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

  app.use((req, res, next) => {
    njkEnv.addGlobal("user", req.session.user ?? null);
    njkEnv.addGlobal("csrfToken", generateToken(req));
    njkEnv.addGlobal("cspNonce", res.locals.cspNonce);
    next();
  });

  // Public routes
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/auth", authRouter(config));

  app.get("/cookie-policy", (_req, res) => {
    res.render("cookie-policy.njk", { title: "Cookies" });
  });

  app.get("/privacy-policy", (_req, res) => {
    res.render("privacy-policy.njk", { title: "Privacy notice" });
  });

  app.get("/accessibility-statement", (_req, res) => {
    res.render("accessibility-statement.njk", {
      title: "Accessibility statement",
    });
  });

  app.get("/", (req, res) => {
    res.render("home.njk", {
      title: "Compliance Scraper",
      user: req.session.user ?? null,
    });
  });

  // Browsers always request /favicon.ico in parallel with the first page load,
  // even when a <link rel="icon"> tag is present. Without this route it would
  // hit requireAuth(), race against the real page request, and overwrite
  // session.returnTo with '/favicon.ico' — landing the user on the favicon post-login.
  app.get("/favicon.ico", (_req, res) => res.redirect("/favicon.svg"));

  // Protected routes
  app.use(requireAuth());

  app.post("/trigger", bedrockRateLimiter, async (_req, res) => {
    try {
      const boss = getBoss();
      if (!boss) {
        res
          .status(503)
          .json({ status: "error", message: "Worker not running" });
        return;
      }
      await boss.send(SCHEDULE_CRON_NAME, {});
      res.status(200).json({
        status: "triggered",
        message: "Enqueued discovery for all services",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ status: "error", message });
    }
  });

  app.use("/accessibility", accessibilityRouter(pool));
  app.use("/cookies", cookiesRouter(pool));
  app.use("/privacy", privacyRouter(pool));
  app.use(
    "/insights",
    insightsRouter(readOnlyPool, config, bedrockRateLimiter),
  );
  app.use("/workers", workersRouter(pool));
  app.use("/services", serviceRouter(pool, bedrockRateLimiter));

  return app;
}
