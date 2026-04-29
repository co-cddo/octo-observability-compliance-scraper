import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitiseReturnTo } from "../../src/server/auth";

describe("sanitiseReturnTo", () => {
  it("allows a simple relative path", () => {
    assert.equal(sanitiseReturnTo("/services"), "/services");
  });

  it("allows a path with query params", () => {
    assert.equal(sanitiseReturnTo("/services?page=2"), "/services?page=2");
  });

  it("allows a nested path", () => {
    assert.equal(
      sanitiseReturnTo("/services/apply-for-a-passport/trigger"),
      "/services/apply-for-a-passport/trigger",
    );
  });

  it("rejects protocol-relative URL (//evil.com)", () => {
    assert.equal(sanitiseReturnTo("//evil.com/path"), "/accessibility");
  });

  it("rejects absolute URL (https://evil.com)", () => {
    assert.equal(sanitiseReturnTo("https://evil.com/path"), "/accessibility");
  });

  it("rejects absolute URL (http://evil.com)", () => {
    assert.equal(sanitiseReturnTo("http://evil.com/path"), "/accessibility");
  });

  it("returns default for undefined", () => {
    assert.equal(sanitiseReturnTo(undefined), "/accessibility");
  });

  it("returns default for empty string", () => {
    assert.equal(sanitiseReturnTo(""), "/accessibility");
  });

  it("rejects backslash-prefixed path (\\\\evil.com)", () => {
    assert.equal(sanitiseReturnTo("\\\\evil.com"), "/accessibility");
  });

  it("rejects path not starting with /", () => {
    assert.equal(sanitiseReturnTo("evil.com/path"), "/accessibility");
  });
});
