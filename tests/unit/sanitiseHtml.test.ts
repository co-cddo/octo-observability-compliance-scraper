import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitiseInsightsHtml } from "../../src/insights/sanitiseHtml";

describe("sanitiseInsightsHtml", () => {
  it("allows safe tags through unchanged", () => {
    const input = "<p>Hello <strong>world</strong></p><ul><li>item</li></ul>";
    assert.equal(sanitiseInsightsHtml(input), input);
  });

  it("allows table markup", () => {
    const input =
      "<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>HMRC</td></tr></tbody></table>";
    assert.equal(sanitiseInsightsHtml(input), input);
  });

  it("strips script tags and their content", () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    assert.equal(sanitiseInsightsHtml(input), "<p>Safe</p>");
  });

  it("strips event handler attributes", () => {
    const input = '<p onclick="alert(1)">Click me</p>';
    assert.equal(sanitiseInsightsHtml(input), "<p>Click me</p>");
  });

  it("strips img tags with onerror", () => {
    const input = '<img src="x" onerror="alert(1)">text';
    assert.equal(sanitiseInsightsHtml(input), "text");
  });

  it("strips iframe, object, and embed tags", () => {
    const input =
      '<iframe src="evil"></iframe><object></object><embed src="x">';
    assert.equal(sanitiseInsightsHtml(input), "");
  });

  it("strips style attributes", () => {
    const input = '<p style="background:url(javascript:alert(1))">styled</p>';
    assert.equal(sanitiseInsightsHtml(input), "<p>styled</p>");
  });

  it("strips anchor tags (not in allowlist)", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    assert.equal(sanitiseInsightsHtml(input), "click");
  });

  it("preserves text content when wrapping tags are stripped", () => {
    const input = "<div>inner content</div>";
    assert.equal(sanitiseInsightsHtml(input), "inner content");
  });

  it("handles empty string", () => {
    assert.equal(sanitiseInsightsHtml(""), "");
  });
});
