import rateLimit from "express-rate-limit";
import type { Request } from "express";

const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env["RATE_LIMIT_WINDOW_MS"] ?? "900000",
  10,
);
const RATE_LIMIT_MAX = parseInt(process.env["RATE_LIMIT_MAX"] ?? "30", 10);

export const bedrockRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.session?.user?.email ?? "anonymous",
  message: { error: "Too many requests — please try again later." },
});
