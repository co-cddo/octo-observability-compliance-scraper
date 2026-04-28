import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectBlock } from "../../src/scraper/redirectDetector";

describe("detectBlock", () => {
  const base = "https://www.example.gov.uk/accessibility-statement";

  it("returns not blocked for a normal page", () => {
    const result = detectBlock(base, base, "<html><body>Hello</body></html>");
    assert.deepEqual(result, { blocked: false });
  });

  describe("captcha detection", () => {
    it("detects reCAPTCHA", () => {
      const html = '<div class="g-recaptcha" data-sitekey="abc"></div>';
      const result = detectBlock(base, base, html);
      assert.deepEqual(result, { blocked: true, reason: "captcha_detected" });
    });

    it("detects Cloudflare challenge", () => {
      const html = "<p>Just a moment</p>";
      const result = detectBlock(base, base, html);
      assert.deepEqual(result, { blocked: true, reason: "captcha_detected" });
    });

    it("detects hcaptcha", () => {
      const html = '<div class="hcaptcha"></div>';
      const result = detectBlock(base, base, html);
      assert.deepEqual(result, { blocked: true, reason: "captcha_detected" });
    });
  });

  describe("geo-restriction detection", () => {
    it("detects 'not available in your region'", () => {
      const html = "<p>This content is not available in your region.</p>";
      const result = detectBlock(base, base, html);
      assert.deepEqual(result, { blocked: true, reason: "geo_restricted" });
    });

    it("detects 'this service is not available'", () => {
      const html = "<p>Sorry, this service is not available right now.</p>";
      const result = detectBlock(base, base, html);
      assert.deepEqual(result, { blocked: true, reason: "geo_restricted" });
    });

    it("is case-insensitive for geo signals", () => {
      const html = "<p>NOT AVAILABLE IN YOUR COUNTRY</p>";
      const result = detectBlock(base, base, html);
      assert.deepEqual(result, { blocked: true, reason: "geo_restricted" });
    });
  });

  describe("domain mismatch", () => {
    it("detects redirect to a different domain", () => {
      const result = detectBlock(
        "https://www.example.gov.uk/page",
        "https://login.microsoftonline.com/oauth",
        "<html></html>",
      );
      assert.deepEqual(result, { blocked: true, reason: "domain_mismatch" });
    });

    it("allows redirect within same eTLD+1", () => {
      const result = detectBlock(
        "https://www.example.gov.uk/page",
        "https://static.example.gov.uk/page",
        "<html></html>",
      );
      assert.deepEqual(result, { blocked: false });
    });

    it("handles two-part TLDs correctly", () => {
      const result = detectBlock(
        "https://www.service.gov.uk/page",
        "https://auth.other.gov.uk/login",
        "<html></html>",
      );
      assert.deepEqual(result, { blocked: true, reason: "domain_mismatch" });
    });
  });

  describe("blocked path patterns", () => {
    it("detects /signin path", () => {
      const result = detectBlock(
        base,
        "https://www.example.gov.uk/signin?redirect=foo",
        "<html></html>",
      );
      assert.deepEqual(result, { blocked: true, reason: "blocked_page" });
    });

    it("detects /login path", () => {
      const result = detectBlock(
        base,
        "https://www.example.gov.uk/login",
        "<html></html>",
      );
      assert.deepEqual(result, { blocked: true, reason: "blocked_page" });
    });

    it("detects access-denied", () => {
      const result = detectBlock(
        base,
        "https://www.example.gov.uk/access-denied",
        "<html></html>",
      );
      assert.deepEqual(result, { blocked: true, reason: "blocked_page" });
    });
  });

  describe("auth redirect", () => {
    it("detects redirect away from an accessibility page", () => {
      const result = detectBlock(
        "https://www.example.gov.uk/accessibility",
        "https://www.example.gov.uk/home",
        "<html></html>",
      );
      assert.deepEqual(result, { blocked: true, reason: "auth_redirect" });
    });

    it("does not flag when URL is unchanged", () => {
      const url = "https://www.example.gov.uk/accessibility";
      const result = detectBlock(url, url, "<html></html>");
      assert.deepEqual(result, { blocked: false });
    });
  });
});
