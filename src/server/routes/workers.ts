import { Router } from "express";
import { Pool } from "pg";
import {
  getBoss,
  DISCOVER_URLS_JOB,
  SCRAPE_ACCESSIBILITY_JOB,
  SCRAPE_COOKIES_JOB,
  SCRAPE_PRIVACY_JOB,
} from "../../worker";

const QUEUES = [
  { name: DISCOVER_URLS_JOB, label: "Discover URLs" },
  { name: SCRAPE_ACCESSIBILITY_JOB, label: "Scrape accessibility" },
  { name: SCRAPE_COOKIES_JOB, label: "Scrape cookies" },
  { name: SCRAPE_PRIVACY_JOB, label: "Scrape privacy" },
];

type QueueStats = {
  name: string;
  label: string;
  created: number;
  retry: number;
  active: number;
  completed: number;
  cancelled: number;
  failed: number;
};

type StateRow = { name: string; state: string; count: string };

export function workersRouter(pool: Pool): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const boss = getBoss();
      if (!boss) {
        res.render("workers.njk", {
          title: "Workers",
          workerRunning: false,
          queues: [],
        });
        return;
      }

      const queueNames = QUEUES.map((q) => q.name);
      const result = await pool.query<StateRow>(
        `SELECT name, state::text, COUNT(*)::int AS count
         FROM pgboss.job
         WHERE name = ANY($1)
         GROUP BY name, state`,
        [queueNames],
      );

      const countsByQueue: Record<string, Record<string, number>> = {};
      for (const row of result.rows) {
        if (!countsByQueue[row.name]) countsByQueue[row.name] = {};
        countsByQueue[row.name][row.state] = parseInt(row.count, 10);
      }

      const queues: QueueStats[] = QUEUES.map((q) => {
        const counts = countsByQueue[q.name] ?? {};
        return {
          name: q.name,
          label: q.label,
          created: counts["created"] ?? 0,
          retry: counts["retry"] ?? 0,
          active: counts["active"] ?? 0,
          completed: counts["completed"] ?? 0,
          cancelled: counts["cancelled"] ?? 0,
          failed: counts["failed"] ?? 0,
        };
      });

      res.render("workers.njk", {
        title: "Workers",
        workerRunning: true,
        queues,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
