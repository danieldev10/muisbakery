import assert from "node:assert/strict";
import { test } from "node:test";

import { reportRangeApiPath } from "../src/app/(app)/management/_components/formatters";

test("builds management report URLs with an explicit date range", () => {
  assert.equal(
    reportRangeApiPath("/management/dashboard", {
      from: "2026-06-14",
      to: "2026-07-14",
    }),
    "/management/dashboard?from=2026-06-14&to=2026-07-14",
  );
});

test("preserves legacy month report URLs when no date range is present", () => {
  assert.equal(
    reportRangeApiPath("/management/dashboard", { month: "2026-07" }),
    "/management/dashboard?month=2026-07",
  );
});
