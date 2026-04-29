import "express-session";

declare module "express-session" {
  interface SessionData {
    user?: { sub: string; email: string; name: string };
    returnTo?: string;
    oauthState?: string;
    insightsHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  }
}
