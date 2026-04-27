import { Router } from "express";
import { Pool } from "pg";
import {
  getLatestPrivacyResults,
  getDistinctOrganisations,
} from "../../db/queries";

export function privacyRouter(pool: Pool): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const organisation =
        typeof req.query["organisation"] === "string"
          ? req.query["organisation"]
          : undefined;
      const page =
        typeof req.query["page"] === "string"
          ? parseInt(req.query["page"], 10)
          : 1;

      const [paginated, organisations] = await Promise.all([
        getLatestPrivacyResults(pool, { organisation, page, pageSize: 25 }),
        getDistinctOrganisations(pool),
      ]);

      res.render("privacy-list.njk", {
        results: paginated.results,
        total: paginated.total,
        page: paginated.page,
        totalPages: paginated.totalPages,
        organisations,
        currentFilters: { organisation },
        title: "Privacy compliance results",
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
