type UrlValidationSuccess = { valid: true };
type UrlValidationFailure = { valid: false; reason: string };
type UrlValidationResult = UrlValidationSuccess | UrlValidationFailure;

export function validatePublicUrl(raw: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "Only HTTPS URLs are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "gov.uk" || hostname.endsWith(".gov.uk")) {
    return { valid: true };
  }

  return { valid: false, reason: "URL must be a gov.uk domain" };
}
