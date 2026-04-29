import { Router, RequestHandler } from "express";
import { Pool } from "pg";
import {
  getAccessibilityResultsBySlug,
  getCookieResultsBySlug,
  getPrivacyResultsBySlug,
  getEffectiveUrls,
  getUrlHistory,
  getServiceBySlug,
  insertComplianceUrl,
} from "../../db/queries";
import { getBoss, sendDiscoverJob, sendScrapeJob } from "../../worker";
import type { ComplianceLinkType } from "../../types";
import "../sessionTypes";

const VALID_TYPES = new Set<ComplianceLinkType>([
  "accessibility",
  "cookies",
  "privacy",
]);

export function serviceRouter(pool: Pool, rateLimiter: RequestHandler): Router {
  const router = Router();

  router.post("/:slug/trigger", rateLimiter, async (req, res, next) => {
    try {
      const { slug } = req.params;
      const service = await getServiceBySlug(pool, slug);
      if (!service) {
        res.status(404).json({ status: "error", message: "Service not found" });
        return;
      }

      const boss = getBoss();
      if (!boss) {
        res
          .status(503)
          .json({ status: "error", message: "Worker not running" });
        return;
      }
      await sendDiscoverJob(boss, slug, { deduplicate: false });
      res.status(200).json({ status: "triggered", service: service.name });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:slug/trigger/:type", rateLimiter, async (req, res, next) => {
    try {
      const { slug, type } = req.params;
      if (!VALID_TYPES.has(type as ComplianceLinkType)) {
        res.status(400).json({ status: "error", message: "Invalid type" });
        return;
      }
      const service = await getServiceBySlug(pool, slug);
      if (!service) {
        res.status(404).json({ status: "error", message: "Service not found" });
        return;
      }

      const boss = getBoss();
      if (!boss) {
        res
          .status(503)
          .json({ status: "error", message: "Worker not running" });
        return;
      }
      await sendScrapeJob(boss, slug, type as ComplianceLinkType, {
        deduplicate: false,
      });
      res
        .status(200)
        .json({ status: "triggered", service: service.name, type });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:slug/urls/:type", async (req, res, next) => {
    try {
      const { slug, type } = req.params;
      if (!VALID_TYPES.has(type as ComplianceLinkType)) {
        res.status(400).json({ status: "error", message: "Invalid type" });
        return;
      }
      const service = await getServiceBySlug(pool, slug);
      if (!service) {
        res.status(404).json({ status: "error", message: "Service not found" });
        return;
      }

      const url = typeof req.body.url === "string" ? req.body.url.trim() : "";
      if (!url) {
        res.status(400).json({ status: "error", message: "URL is required" });
        return;
      }

      const user = req.session.user;
      await insertComplianceUrl(pool, {
        serviceSlug: slug,
        complianceType: type as ComplianceLinkType,
        url,
        source: "manual",
        status: "found",
        changedByEmail: user?.email ?? null,
        changedByName: user?.name ?? null,
      });

      const boss = getBoss();
      if (boss) {
        await sendScrapeJob(boss, slug, type as ComplianceLinkType, {
          deduplicate: false,
        });
      }

      res.redirect(`/services/${slug}`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:slug", async (req, res, next) => {
    try {
      const { slug } = req.params;
      const service = await getServiceBySlug(pool, slug);

      if (!service) {
        res.status(404).render("error.njk", {
          title: "Not found",
          message: "Service not found.",
        });
        return;
      }

      const [
        urls,
        accessibilityUrlHistory,
        cookiesUrlHistory,
        privacyUrlHistory,
        accessibilityHistory,
        cookieHistory,
        privacyHistory,
      ] = await Promise.all([
        getEffectiveUrls(pool, slug),
        getUrlHistory(pool, slug, "accessibility"),
        getUrlHistory(pool, slug, "cookies"),
        getUrlHistory(pool, slug, "privacy"),
        getAccessibilityResultsBySlug(pool, slug),
        getCookieResultsBySlug(pool, slug),
        getPrivacyResultsBySlug(pool, slug),
      ]);

      res.render("service.njk", {
        service,
        urls,
        urlHistory: {
          accessibility: accessibilityUrlHistory,
          cookies: cookiesUrlHistory,
          privacy: privacyUrlHistory,
        },
        accessibility: {
          latest: accessibilityHistory[0] ?? null,
          history: accessibilityHistory,
        },
        cookies: {
          latest: cookieHistory[0] ?? null,
          history: cookieHistory,
        },
        privacy: {
          latest: privacyHistory[0] ?? null,
          history: privacyHistory,
        },
        title: service.name,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
