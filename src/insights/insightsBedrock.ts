import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Config } from "../config";

type ConversationMessage = { role: "user" | "assistant"; content: string };

const SCHEMA_PROMPT = `You are a SQL expert querying a PostgreSQL database of UK government digital service compliance data.

Tables:

services (
  name TEXT, slug TEXT UNIQUE, organisation TEXT,
  live_service_url TEXT, phase TEXT, theme TEXT
)

accessibility_results (
  scraped_at TIMESTAMPTZ, service_name TEXT, service_slug TEXT, organisation TEXT,
  live_service_url TEXT,
  scrape_status TEXT CHECK ('success','no_link_found','scrape_error','bedrock_error','no_data_extracted'),
  accessibility_statement_url TEXT,
  wcag_standard TEXT,
  compliance_status TEXT CHECK ('fully_compliant','partially_compliant','not_compliant'),
  date_prepared TEXT, date_reviewed TEXT, date_tested TEXT,
  areas_of_non_compliance TEXT[], remediation_commitments TEXT[]
)

cookie_results (
  scraped_at TIMESTAMPTZ, service_name TEXT, service_slug TEXT, organisation TEXT,
  live_service_url TEXT,
  scrape_status TEXT CHECK ('success','no_link_found','scrape_error','bedrock_error','no_data_extracted'),
  cookie_policy_url TEXT,
  consent_mechanism_present BOOLEAN,
  consent_framework TEXT,
  analytics_tools TEXT[],
  tracking_ids JSONB (keys like 'ga_property','gtm_id','dynatrace_id','hotjar_id'),
  cookies_listed TEXT[],
  cookie_purposes TEXT
)

privacy_results (
  scraped_at TIMESTAMPTZ, service_name TEXT, service_slug TEXT, organisation TEXT,
  live_service_url TEXT,
  scrape_status TEXT CHECK ('success','no_link_found','scrape_error','bedrock_error','no_data_extracted'),
  privacy_policy_url TEXT,
  data_controllers JSONB (array of {"name": string, "contact": string|null}),
  legal_basis TEXT,
  data_shared_with TEXT[],
  retention_period TEXT,
  last_updated_date TEXT (free-form text, various date formats like "15 January 2024", "Jan 2024", "2024-01-15")
)

Key patterns:
- For latest result per service, use: SELECT DISTINCT ON (service_slug) * FROM <table> ORDER BY service_slug, scraped_at DESC
- To unnest TEXT[] columns, use: unnest(analytics_tools)
- To query JSONB arrays: jsonb_array_elements(data_controllers)->>'name'
- To query JSONB objects: tracking_ids->>'ga_property'
- Organisation names are in the results tables (not just the services table)
- For date comparisons on last_updated_date TEXT, try multiple format patterns with COALESCE and TRY_CAST if needed, or use string-based comparisons like: WHERE last_updated_date LIKE '%2024' or similar

Rules:
- Your ENTIRE response must be a single SQL SELECT query and nothing else. No explanation, no preamble, no markdown, no code fences, no trailing commentary — just the raw SQL.
- CTEs (WITH ... AS (...) SELECT ...) are allowed.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or TRUNCATE.
- Always include a LIMIT clause (max 100).
- Use explicit column names rather than SELECT *.`;

const SUMMARISE_PROMPT = `You are a data analyst summarising SQL query results for UK government civil servants.
Present the results as HTML using only these tags: <p>, <strong>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
- Use <table> for tabular data
- Use <ul> or <ol> for lists
- Use <strong> for key numbers or findings
- Keep it concise — no more than a few paragraphs
Do not include the SQL query, markdown, or any other tags (no <html>, <body>, <div>, <span>, etc.) in your response.`;

function checkCredentialError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (
    name === "ExpiredTokenException" ||
    name === "UnrecognizedClientException" ||
    message.includes("security token") ||
    message.includes("session has expired") ||
    message.includes("reauthenticate")
  ) {
    throw new Error(`AWS credentials are expired or invalid. (${message})`);
  }
}

async function callConverse(
  systemPrompt: string,
  messages: ConversationMessage[],
  config: Pick<Config, "insightsModelId" | "awsRegion">,
): Promise<string> {
  const client = new BedrockRuntimeClient({ region: config.awsRegion });

  const command = new ConverseCommand({
    modelId: config.insightsModelId,
    system: [{ text: systemPrompt }],
    messages: messages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    inferenceConfig: { maxTokens: 4096 },
  });

  const response = await client.send(command);
  const output = response.output;
  if (!output || !("message" in output) || !output.message?.content) {
    throw new Error("Empty response from Bedrock Converse API");
  }

  const textBlock = output.message.content.find(
    (b): b is { text: string } =>
      "text" in b && typeof (b as { text?: string }).text === "string",
  );
  if (!textBlock) {
    throw new Error("No text content in Bedrock Converse response");
  }

  return textBlock.text
    .replace(/^```(?:sql)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}

export async function generateSql(
  question: string,
  history: ConversationMessage[],
  config: Pick<Config, "insightsModelId" | "awsRegion">,
): Promise<string> {
  try {
    const messages: ConversationMessage[] = [
      ...history,
      { role: "user", content: question },
    ];
    return await callConverse(SCHEMA_PROMPT, messages, config);
  } catch (err) {
    checkCredentialError(err);
    throw err;
  }
}

export async function retrySqlWithError(
  question: string,
  failedSql: string,
  errorMessage: string,
  history: ConversationMessage[],
  config: Pick<Config, "insightsModelId" | "awsRegion">,
): Promise<string> {
  try {
    const messages: ConversationMessage[] = [
      ...history,
      { role: "user", content: question },
      { role: "assistant", content: failedSql },
      {
        role: "user",
        content: `That SQL query returned this PostgreSQL error:\n${errorMessage}\n\nPlease fix the query and respond with ONLY the corrected SQL.`,
      },
    ];
    return await callConverse(SCHEMA_PROMPT, messages, config);
  } catch (err) {
    checkCredentialError(err);
    throw err;
  }
}

export async function summariseResults(
  question: string,
  sql: string,
  rows: Record<string, unknown>[],
  rowCount: number,
  config: Pick<Config, "insightsModelId" | "awsRegion">,
): Promise<string> {
  try {
    const resultsJson = JSON.stringify(rows.slice(0, 50), null, 2);
    const userContent = `Question: ${question}\n\nSQL query used:\n${sql}\n\nResults (${rowCount} rows${rowCount > 50 ? ", showing first 50" : ""}):\n${resultsJson}`;

    return await callConverse(
      SUMMARISE_PROMPT,
      [{ role: "user", content: userContent }],
      config,
    );
  } catch (err) {
    checkCredentialError(err);
    throw err;
  }
}
