type ValidationSuccess = { valid: true; sql: string };
type ValidationFailure = { valid: false; reason: string };
type ValidationResult = ValidationSuccess | ValidationFailure;

const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "EXECUTE",
  "EXEC",
];

const MAX_ROWS = 100;

export function validateSql(raw: string): ValidationResult {
  const trimmed = raw.trim().replace(/;\s*$/, "");

  if (trimmed.length === 0) {
    return { valid: false, reason: "Empty query" };
  }

  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, reason: "Only SELECT queries are allowed" };
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Forbidden keyword: ${keyword}` };
    }
  }

  const hasLimit = /\bLIMIT\s+\d+/i.test(trimmed);
  const sql = hasLimit ? trimmed : `${trimmed} LIMIT ${MAX_ROWS}`;

  return { valid: true, sql };
}
