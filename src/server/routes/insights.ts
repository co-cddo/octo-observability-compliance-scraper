import { Router, RequestHandler } from "express";
import { Pool } from "pg";
import type { Config } from "../../config";
import { validateSql } from "../../insights/sqlValidator";
import {
  generateSql,
  retrySqlWithError,
  summariseResults,
} from "../../insights/insightsBedrock";

const MAX_HISTORY = 20;

type ConversationMessage = { role: "user" | "assistant"; content: string };

export function insightsRouter(
  readOnlyPool: Pool,
  config: Config,
  rateLimiter: RequestHandler,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.render("insights.njk", { title: "Insights" });
  });

  router.post("/ask", rateLimiter, async (req, res) => {
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) {
      res.status(400).json({ error: "Please enter a question." });
      return;
    }

    const history: ConversationMessage[] = req.session.insightsHistory ?? [];

    try {
      let sql = await generateSql(question, history, config);
      console.log("[insights] Raw SQL from model:", JSON.stringify(sql));
      let validation = validateSql(sql);

      if (!validation.valid) {
        console.log("[insights] Validation failed:", validation.reason);
        res.json({
          answer: `I couldn't generate a valid query for that question. ${validation.reason}.`,
          sql,
          rowCount: 0,
          rows: [],
        });
        return;
      }

      let rows: Record<string, unknown>[];
      try {
        const result = await readOnlyPool.query(validation.sql);
        rows = result.rows as Record<string, unknown>[];
      } catch (dbErr) {
        const dbMessage =
          dbErr instanceof Error ? dbErr.message : String(dbErr);

        sql = await retrySqlWithError(
          question,
          sql,
          dbMessage,
          history,
          config,
        );
        validation = validateSql(sql);
        if (!validation.valid) {
          res.json({
            answer: `I tried to fix the query but couldn't generate a valid one. ${validation.reason}.`,
            sql: null,
            rowCount: 0,
            rows: [],
          });
          return;
        }

        try {
          const retryResult = await readOnlyPool.query(validation.sql);
          rows = retryResult.rows as Record<string, unknown>[];
        } catch (retryErr) {
          const retryMessage =
            retryErr instanceof Error ? retryErr.message : String(retryErr);
          res.json({
            answer: `I wasn't able to query the database for that. Error: ${retryMessage}`,
            sql: validation.sql,
            rowCount: 0,
            rows: [],
          });
          return;
        }
      }

      const answer = await summariseResults(
        question,
        validation.sql,
        rows,
        rows.length,
        config,
      );

      history.push({ role: "user", content: question });
      history.push({ role: "assistant", content: answer });
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }
      req.session.insightsHistory = history;

      res.json({
        answer,
        sql: validation.sql,
        rowCount: rows.length,
        rows: rows.slice(0, 20),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[insights] Error:", message);
      res.status(500).json({ error: message });
    }
  });

  router.post("/clear", (req, res) => {
    req.session.insightsHistory = [];
    res.redirect("/insights");
  });

  return router;
}
