import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSql } from "../../src/insights/sqlValidator";

describe("validateSql", () => {
  describe("basic validation", () => {
    it("accepts a simple SELECT", () => {
      const result = validateSql("SELECT name FROM services LIMIT 10");
      assert.equal(result.valid, true);
    });

    it("accepts a CTE (WITH ... SELECT)", () => {
      const result = validateSql(
        "WITH cte AS (SELECT slug FROM services) SELECT * FROM cte LIMIT 5",
      );
      assert.equal(result.valid, true);
    });

    it("rejects empty queries", () => {
      const result = validateSql("");
      assert.equal(result.valid, false);
    });

    it("rejects whitespace-only queries", () => {
      const result = validateSql("   ");
      assert.equal(result.valid, false);
    });

    it("appends LIMIT when missing", () => {
      const result = validateSql("SELECT 1");
      assert.equal(result.valid, true);
      if (result.valid) {
        assert.match(result.sql, /LIMIT/i);
      }
    });
  });

  describe("multi-statement rejection", () => {
    it("rejects two SELECT statements", () => {
      const result = validateSql("SELECT 1; SELECT 2");
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason.toLowerCase(), /multiple|statement/);
      }
    });

    it("rejects SELECT followed by SET", () => {
      const result = validateSql("SELECT 1; SET statement_timeout = 0");
      assert.equal(result.valid, false);
    });

    it("rejects SELECT followed by RESET", () => {
      const result = validateSql(
        "SELECT 1; RESET default_transaction_read_only",
      );
      assert.equal(result.valid, false);
    });
  });

  describe("write operation rejection", () => {
    it("rejects INSERT", () => {
      const result = validateSql("INSERT INTO services VALUES ('x', 'x', 'x')");
      assert.equal(result.valid, false);
    });

    it("rejects DELETE", () => {
      const result = validateSql("DELETE FROM services");
      assert.equal(result.valid, false);
    });

    it("rejects DROP", () => {
      const result = validateSql("DROP TABLE services");
      assert.equal(result.valid, false);
    });

    it("rejects CREATE", () => {
      const result = validateSql("CREATE TABLE evil (id int)");
      assert.equal(result.valid, false);
    });

    it("rejects SELECT INTO (creates a table)", () => {
      const result = validateSql(
        "SELECT * INTO new_table FROM services LIMIT 1",
      );
      assert.equal(result.valid, false);
    });
  });

  describe("LIMIT cap", () => {
    it("reduces LIMIT above 100 to 100", () => {
      const result = validateSql("SELECT name FROM services LIMIT 999");
      assert.equal(result.valid, true);
      if (result.valid) {
        assert.ok(
          !result.sql.includes("999"),
          `Should not contain original limit: ${result.sql}`,
        );
        assert.match(result.sql, /LIMIT\s*\(?100\)?/i);
      }
    });

    it("preserves LIMIT at or below 100", () => {
      const result = validateSql("SELECT name FROM services LIMIT 50");
      assert.equal(result.valid, true);
      if (result.valid) {
        assert.match(result.sql, /LIMIT\s*\(?50\)?/i);
      }
    });
  });

  describe("function allowlist", () => {
    it("allows count()", () => {
      const result = validateSql("SELECT count(*) FROM services LIMIT 1");
      assert.equal(result.valid, true);
    });

    it("allows coalesce()", () => {
      const result = validateSql(
        "SELECT coalesce(name, 'unknown') FROM services LIMIT 10",
      );
      assert.equal(result.valid, true);
    });

    it("allows unnest()", () => {
      const result = validateSql(
        "SELECT unnest(analytics_tools) FROM cookie_results LIMIT 10",
      );
      assert.equal(result.valid, true);
    });

    it("allows jsonb_array_elements()", () => {
      const result = validateSql(
        "SELECT jsonb_array_elements(data_controllers) FROM privacy_results LIMIT 10",
      );
      assert.equal(result.valid, true);
    });

    it("rejects pg_read_file()", () => {
      const result = validateSql("SELECT pg_read_file('/etc/passwd') LIMIT 1");
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason.toLowerCase(), /function/);
      }
    });

    it("rejects pg_ls_dir()", () => {
      const result = validateSql("SELECT pg_ls_dir('/') LIMIT 1");
      assert.equal(result.valid, false);
    });

    it("rejects lo_import()", () => {
      const result = validateSql("SELECT lo_import('/etc/passwd') LIMIT 1");
      assert.equal(result.valid, false);
    });

    it("rejects pg_sleep()", () => {
      const result = validateSql("SELECT pg_sleep(30) LIMIT 1");
      assert.equal(result.valid, false);
    });

    it("rejects dblink()", () => {
      const result = validateSql(
        "SELECT * FROM dblink('host=evil', 'SELECT 1') AS t(a int) LIMIT 1",
      );
      assert.equal(result.valid, false);
    });

    it("rejects set_config()", () => {
      const result = validateSql(
        "SELECT set_config('log_statement', 'all', false) LIMIT 1",
      );
      assert.equal(result.valid, false);
    });

    it("rejects current_setting()", () => {
      const result = validateSql(
        "SELECT current_setting('data_directory') LIMIT 1",
      );
      assert.equal(result.valid, false);
    });

    it("rejects pg_terminate_backend()", () => {
      const result = validateSql(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity LIMIT 1",
      );
      assert.equal(result.valid, false);
    });
  });
});
