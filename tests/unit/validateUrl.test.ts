import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePublicUrl } from "../../src/server/validateUrl";

describe("validatePublicUrl", () => {
  it("accepts a valid HTTPS gov.uk URL", () => {
    const result = validatePublicUrl(
      "https://www.gov.uk/accessibility-statement",
    );
    assert.equal(result.valid, true);
  });

  it("accepts a subdomain of gov.uk", () => {
    const result = validatePublicUrl(
      "https://design-system.service.gov.uk/accessibility/",
    );
    assert.equal(result.valid, true);
  });

  it("rejects HTTP (non-HTTPS)", () => {
    const result = validatePublicUrl(
      "http://www.gov.uk/accessibility-statement",
    );
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reason, /HTTPS/i);
  });

  it("rejects non-gov.uk domain", () => {
    const result = validatePublicUrl("https://evil.com/phish");
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reason, /gov\.uk/);
  });

  it("rejects IP addresses", () => {
    const result = validatePublicUrl("https://169.254.169.254/metadata");
    assert.equal(result.valid, false);
  });

  it("rejects private IP addresses", () => {
    const result = validatePublicUrl("https://10.0.1.5/internal");
    assert.equal(result.valid, false);
  });

  it("rejects localhost", () => {
    const result = validatePublicUrl("https://localhost:3000/secret");
    assert.equal(result.valid, false);
  });

  it("rejects invalid URLs", () => {
    const result = validatePublicUrl("not a url at all");
    assert.equal(result.valid, false);
  });

  it("rejects empty string", () => {
    const result = validatePublicUrl("");
    assert.equal(result.valid, false);
  });

  it("rejects FTP protocol", () => {
    const result = validatePublicUrl("ftp://files.gov.uk/data");
    assert.equal(result.valid, false);
  });

  it("rejects gov.uk.evil.com (suffix attack)", () => {
    const result = validatePublicUrl("https://gov.uk.evil.com/phish");
    assert.equal(result.valid, false);
  });
});
