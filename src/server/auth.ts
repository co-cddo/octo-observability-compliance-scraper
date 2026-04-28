import { Router, RequestHandler } from "express";
import * as crypto from "crypto";
import type { Config } from "../config";
import "./sessionTypes";

type OidcEndpoints = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

let cachedEndpoints: OidcEndpoints | null = null;

export async function discoverOidcEndpoints(
  issuer: string,
  retries = 5,
): Promise<OidcEndpoints> {
  if (cachedEndpoints) return cachedEndpoints;

  const url = `${issuer}/.well-known/openid-configuration`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const doc = (await res.json()) as Record<string, unknown>;
      cachedEndpoints = {
        authorization_endpoint: doc["authorization_endpoint"] as string,
        token_endpoint: doc["token_endpoint"] as string,
        userinfo_endpoint: doc["userinfo_endpoint"] as string,
      };
      return cachedEndpoints;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        const delay = 1000 * 2 ** attempt;
        console.warn(
          `[auth] OIDC discovery attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `OIDC discovery failed for ${issuer} after ${retries + 1} attempts: ${lastError?.message}`,
  );
}

const ASSET_EXTENSION = /\.\w{2,5}$/;

export function requireAuth(): RequestHandler {
  return (req, res, next) => {
    if (req.session.user) return next();
    if (!ASSET_EXTENSION.test(req.path)) {
      req.session.returnTo = req.originalUrl;
    }
    res.redirect("/");
  };
}

export function authRouter(config: Config): Router {
  const router = Router();

  router.get("/login", async (req, res) => {
    try {
      const endpoints = await discoverOidcEndpoints(config.ssoIssuer);
      const state = crypto.randomBytes(32).toString("hex");
      req.session.oauthState = state;

      const params = new URLSearchParams({
        client_id: config.ssoClientId,
        redirect_uri: `${config.appUrl}/auth/callback`,
        response_type: "code",
        scope: "openid email profile",
        state,
      });

      req.session.save(() => {
        res.redirect(
          `${endpoints.authorization_endpoint}?${params.toString()}`,
        );
      });
    } catch (err) {
      console.error("[auth] Login error:", err);
      res.status(500).send("Authentication service unavailable");
    }
  });

  router.get("/callback", async (req, res) => {
    try {
      const endpoints = await discoverOidcEndpoints(config.ssoIssuer);
      const { code, state } = req.query;

      if (!code || typeof code !== "string") {
        res.status(400).send("Missing authorization code");
        return;
      }

      if (state !== req.session.oauthState) {
        res.status(403).send("Invalid OAuth state");
        return;
      }
      delete req.session.oauthState;

      const credentials = Buffer.from(
        `${config.ssoClientId}:${config.ssoClientSecret}`,
      ).toString("base64");

      const tokenResponse = await fetch(endpoints.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: `${config.appUrl}/auth/callback`,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const body = await tokenResponse.text();
        console.error(
          "[auth] Token exchange failed:",
          tokenResponse.status,
          body,
        );
        res.status(502).send("Authentication failed");
        return;
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        id_token?: string;
      };

      const profileResponse = await fetch(endpoints.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!profileResponse.ok) {
        console.error("[auth] Profile fetch failed:", profileResponse.status);
        res.status(502).send("Failed to fetch user profile");
        return;
      }

      const profile = (await profileResponse.json()) as {
        email?: string;
        name?: string;
        display_name?: string;
      };

      req.session.user = {
        email: profile.email ?? "unknown",
        name:
          profile.display_name ?? profile.name ?? profile.email ?? "Unknown",
      };

      const returnTo = req.session.returnTo ?? "/accessibility";
      delete req.session.returnTo;
      res.redirect(returnTo);
    } catch (err) {
      console.error("[auth] Callback error:", err);
      res.status(500).send("Authentication error");
    }
  });

  router.get("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  return router;
}
