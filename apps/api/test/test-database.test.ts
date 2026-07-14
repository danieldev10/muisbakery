import assert from "node:assert/strict";
import { test } from "node:test";

import { assertSafeTestDatabaseUrl } from "../src/config/test-database";

test("accepts a clearly named local PostgreSQL test database", () => {
  const result = assertSafeTestDatabaseUrl(
    "postgresql://daniel@127.0.0.1:5432/muisbakery_test?schema=public",
  );

  assert.equal(result.databaseName, "muisbakery_test");
});

test("rejects remote database hosts", () => {
  assert.throws(
    () =>
      assertSafeTestDatabaseUrl(
        "postgresql://postgres@example.supabase.com:5432/muisbakery_test",
      ),
    /only use local PostgreSQL/,
  );
});

test("rejects local databases without an explicit test suffix", () => {
  assert.throws(
    () =>
      assertSafeTestDatabaseUrl(
        "postgresql://daniel@127.0.0.1:5432/muisbakery",
      ),
    /must end in _test/,
  );
});

