import PgBoss from "pg-boss";
import { loadConfig } from "../config";
import { getPool } from "../db/client";
import { createBoss } from "./pgBossClient";
import { launchBrowser } from "../scraper/browser";
import { discoverUrls } from "../scraper/urlDiscovery";
import { scrapeAccessibility } from "../scraper/accessibilityScraper";
import { scrapeCookies } from "../scraper/cookieScraper";
import { scrapePrivacy } from "../scraper/privacyScraper";
import type { ComplianceLinkType } from "../types";

export const DISCOVER_URLS_JOB = "discover-urls";
export const SCRAPE_ACCESSIBILITY_JOB = "scrape-accessibility";
export const SCRAPE_COOKIES_JOB = "scrape-cookies";
export const SCRAPE_PRIVACY_JOB = "scrape-privacy";
export const SCHEDULE_CRON_NAME = "enqueue-daily-scrapes";

const SCRAPE_JOB_NAMES: Record<ComplianceLinkType, string> = {
  accessibility: SCRAPE_ACCESSIBILITY_JOB,
  cookies: SCRAPE_COOKIES_JOB,
  privacy: SCRAPE_PRIVACY_JOB,
};

type SlugJobData = { slug: string };

let bossInstance: PgBoss | null = null;

export function getBoss(): PgBoss | null {
  return bossInstance;
}

export function sendDiscoverJob(
  boss: PgBoss,
  slug: string,
  options?: { deduplicate?: boolean },
): Promise<string | null> {
  return boss.send(
    DISCOVER_URLS_JOB,
    { slug },
    {
      retryLimit: 2,
      retryDelay: 300,
      expireInMinutes: 30,
      ...(options?.deduplicate !== false
        ? { singletonKey: `discover-${slug}` }
        : {}),
    },
  );
}

export function sendScrapeJob(
  boss: PgBoss,
  slug: string,
  type: ComplianceLinkType,
  options?: { deduplicate?: boolean },
): Promise<string | null> {
  const jobName = SCRAPE_JOB_NAMES[type];
  return boss.send(
    jobName,
    { slug },
    {
      retryLimit: 2,
      retryDelay: 300,
      expireInMinutes: 30,
      ...(options?.deduplicate !== false
        ? { singletonKey: `${type}-${slug}` }
        : {}),
    },
  );
}

export async function startWorker(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config.databaseUrl, config.nodeEnv);
  const boss = createBoss(config);
  bossInstance = boss;

  boss.on("error", (error) => {
    console.error("[pg-boss] Error:", error);
  });

  await boss.start();
  console.log("[worker] pg-boss started");

  await boss.createQueue(SCHEDULE_CRON_NAME);
  await boss.createQueue(DISCOVER_URLS_JOB);
  await boss.createQueue(SCRAPE_ACCESSIBILITY_JOB);
  await boss.createQueue(SCRAPE_COOKIES_JOB);
  await boss.createQueue(SCRAPE_PRIVACY_JOB);
  console.log("[worker] Queues created");

  await boss.schedule(SCHEDULE_CRON_NAME, "0 2 * * *", undefined, {
    tz: "Europe/London",
  });
  console.log("[worker] Registered daily schedule: 0 2 * * * Europe/London");

  await boss.work<Record<string, never>>(SCHEDULE_CRON_NAME, async () => {
    console.log("[worker] Daily cron fired, enqueuing discovery jobs...");
    const result = await pool.query<{ slug: string }>(
      "SELECT slug FROM services",
    );
    for (const row of result.rows) {
      await sendDiscoverJob(boss, row.slug);
    }
    console.log(`[worker] Enqueued ${result.rows.length} discover-urls jobs`);
  });

  let browser = await launchBrowser();

  async function ensureBrowser(): Promise<typeof browser> {
    if (!browser.isConnected()) {
      console.log("[worker] Browser disconnected, relaunching...");
      browser = await launchBrowser();
    }
    return browser;
  }

  async function lookupService(slug: string): Promise<{
    name: string;
    slug: string;
    organisation: string;
    liveServiceUrl: string;
  } | null> {
    const rows = await pool.query<{
      name: string;
      slug: string;
      organisation: string;
      live_service_url: string;
    }>(
      "SELECT name, slug, organisation, live_service_url FROM services WHERE slug = $1",
      [slug],
    );
    if (rows.rows.length === 0) return null;
    const r = rows.rows[0];
    return {
      name: r.name,
      slug: r.slug,
      organisation: r.organisation,
      liveServiceUrl: r.live_service_url,
    };
  }

  const WORKER_CONCURRENCY = 3;
  const allQueues = [
    DISCOVER_URLS_JOB,
    SCRAPE_ACCESSIBILITY_JOB,
    SCRAPE_COOKIES_JOB,
    SCRAPE_PRIVACY_JOB,
  ];

  async function processOneJob(
    job: PgBoss.Job<SlugJobData>,
    queueName: string,
  ): Promise<void> {
    const { slug } = job.data;
    try {
      if (queueName === DISCOVER_URLS_JOB) {
        const svc = await lookupService(slug);
        if (!svc) {
          console.error(`[worker] Service not found for discovery: ${slug}`);
          await boss.fail(queueName, job.id);
          return;
        }

        console.log(`[worker] Discovering URLs: ${svc.name}`);
        const activeBrowser = await ensureBrowser();
        const results = await discoverUrls(
          svc.slug,
          svc.liveServiceUrl,
          activeBrowser,
          pool,
          config,
        );

        for (const r of results) {
          if (r.url) {
            await sendScrapeJob(boss, slug, r.type);
          }
        }

        const found = results
          .filter((r) => r.url)
          .map((r) => r.type)
          .join(", ");
        console.log(
          `[worker] Discovery done: ${svc.name} — found: ${found || "none"}`,
        );
        await boss.complete(queueName, job.id);
      } else {
        const svc = await lookupService(slug);
        if (!svc) {
          console.error(`[worker] Service not found: ${slug}`);
          await boss.fail(queueName, job.id);
          return;
        }

        const activeBrowser = await ensureBrowser();

        if (queueName === SCRAPE_ACCESSIBILITY_JOB) {
          console.log(`[worker] Scraping accessibility: ${svc.name}`);
          const result = await scrapeAccessibility(
            svc,
            activeBrowser,
            pool,
            config,
          );
          console.log(
            `[worker] Accessibility: ${result.scrapeStatus} — ${svc.name}`,
          );
        } else if (queueName === SCRAPE_COOKIES_JOB) {
          console.log(`[worker] Scraping cookies: ${svc.name}`);
          const result = await scrapeCookies(svc, activeBrowser, pool, config);
          console.log(`[worker] Cookies: ${result.scrapeStatus} — ${svc.name}`);
        } else if (queueName === SCRAPE_PRIVACY_JOB) {
          console.log(`[worker] Scraping privacy: ${svc.name}`);
          const result = await scrapePrivacy(svc, activeBrowser, pool, config);
          console.log(`[worker] Privacy: ${result.scrapeStatus} — ${svc.name}`);
        }

        await boss.complete(queueName, job.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Error in ${queueName} for ${slug}: ${msg}`);
      await boss.fail(queueName, job.id);
    }
  }

  console.log(
    `[worker] Starting job loop (${WORKER_CONCURRENCY} concurrent workers)`,
  );

  const processJobs = async (): Promise<void> => {
    while (true) {
      let processed = false;

      for (const queueName of allQueues) {
        const jobs = await boss.fetch<SlugJobData>(queueName, { batchSize: 1 });
        if (!jobs || jobs.length === 0) continue;

        processed = true;
        await processOneJob(jobs[0], queueName);
      }

      if (!processed) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  };

  for (let i = 0; i < WORKER_CONCURRENCY; i++) {
    processJobs().catch((err) => {
      console.error("[worker] Worker crashed:", err);
    });
  }

  const shutdown = async (): Promise<void> => {
    console.log("[worker] Shutting down...");
    await boss.stop({ graceful: true, timeout: 30000 });
    await browser.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
