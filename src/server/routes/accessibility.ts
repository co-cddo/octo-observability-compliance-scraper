import { Router } from "express";
import { Pool } from "pg";
import {
  getLatestAccessibilityResults,
  getDistinctOrganisations,
} from "../../db/queries";

export function accessibilityRouter(pool: Pool): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const status =
        typeof req.query["status"] === "string"
          ? req.query["status"]
          : undefined;
      const organisation =
        typeof req.query["organisation"] === "string"
          ? req.query["organisation"]
          : undefined;
      const page =
        typeof req.query["page"] === "string"
          ? parseInt(req.query["page"], 10)
          : 1;

      const [paginated, organisations] = await Promise.all([
        getLatestAccessibilityResults(pool, {
          status,
          organisation,
          page,
          pageSize: 25,
        }),
        getDistinctOrganisations(pool),
      ]);

      res.render("results.njk", {
        results: paginated.results,
        total: paginated.total,
        page: paginated.page,
        totalPages: paginated.totalPages,
        organisations,
        currentFilters: { status, organisation },
        title: "Accessibility compliance results",
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
