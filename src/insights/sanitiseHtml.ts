import sanitize from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

export function sanitiseInsightsHtml(dirty: string): string {
  return sanitize(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
}
