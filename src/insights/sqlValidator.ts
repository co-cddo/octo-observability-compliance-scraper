import { parse, astVisitor, toSql } from "pgsql-ast-parser";
import type { Statement } from "pgsql-ast-parser";

type ValidationSuccess = { valid: true; sql: string };
type ValidationFailure = { valid: false; reason: string };
type ValidationResult = ValidationSuccess | ValidationFailure;

const MAX_ROWS = 100;

const ALLOWED_FUNCTIONS = new Set([
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "array_agg",
  "string_agg",
  "coalesce",
  "nullif",
  "greatest",
  "least",
  "lower",
  "upper",
  "trim",
  "length",
  "substring",
  "replace",
  "concat",
  "left",
  "right",
  "split_part",
  "regexp_replace",
  "regexp_matches",
  "now",
  "date_trunc",
  "extract",
  "to_char",
  "to_date",
  "to_timestamp",
  "age",
  "date_part",
  "round",
  "ceil",
  "floor",
  "abs",
  "trunc",
  "cast",
  "jsonb_array_elements",
  "jsonb_array_elements_text",
  "jsonb_each",
  "jsonb_each_text",
  "jsonb_object_keys",
  "json_array_elements",
  "unnest",
  "array_length",
  "array_to_string",
  "row_number",
  "rank",
  "dense_rank",
  "lag",
  "lead",
  "first_value",
  "last_value",
  "ntile",
  "bool_and",
  "bool_or",
  "every",
]);

export function validateSql(raw: string): ValidationResult {
  const trimmed = raw.trim().replace(/;\s*$/, "");

  if (trimmed.length === 0) {
    return { valid: false, reason: "Empty query" };
  }

  let statements: Statement[];
  try {
    statements = parse(trimmed);
  } catch {
    return { valid: false, reason: "Could not parse SQL" };
  }

  if (statements.length !== 1) {
    return { valid: false, reason: "Multiple statements are not allowed" };
  }

  const stmt = statements[0];

  if (stmt.type !== "select" && stmt.type !== "with") {
    return { valid: false, reason: "Only SELECT queries are allowed" };
  }

  let disallowedFn: string | null = null;
  const visitor = astVisitor((map) => ({
    call: (fn) => {
      const name = (fn.function as { name?: string })?.name?.toLowerCase();
      if (name && !ALLOWED_FUNCTIONS.has(name)) {
        disallowedFn = name;
      }
      map.super().call(fn);
    },
  }));
  visitor.statement(stmt);

  if (disallowedFn) {
    return { valid: false, reason: `Function not allowed: ${disallowedFn}` };
  }

  const selectNode =
    stmt.type === "with" ? (stmt as { in?: { limit?: LimitNode } }).in : stmt;

  if (selectNode) {
    const limit = (selectNode as { limit?: LimitNode }).limit;
    if (limit?.limit?.type === "integer" && limit.limit.value > MAX_ROWS) {
      limit.limit.value = MAX_ROWS;
    } else if (!limit) {
      (selectNode as { limit?: LimitNode }).limit = {
        limit: { type: "integer", value: MAX_ROWS },
      };
    }
  }

  return { valid: true, sql: toSql.statement(stmt) };
}

type LimitNode = {
  limit?: { type: string; value: number };
};
