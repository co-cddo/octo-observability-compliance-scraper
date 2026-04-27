import { Router } from "express";
import { Pool } from "pg";
import {
  getLatestCookieResults,
  getDistinctOrganisations,
} from "../../db/queries";

export function cookiesRouter(pool: Pool): Router {
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
        getLatestCookieResults(pool, { organisation, page, pageSize: 25 }),
        getDistinctOrganisations(pool),
      ]);

      res.render("cookies-list.njk", {
        results: paginated.results,
        total: paginated.total,
        page: paginated.page,
        totalPages: paginated.totalPages,
        organisations,
        currentFilters: { organisation },
        title: "Cookie compliance results",
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
