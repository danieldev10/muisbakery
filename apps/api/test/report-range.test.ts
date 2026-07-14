import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";

import { getReportRange } from "../src/management/report-range";

test("report ranges include the selected to date", () => {
  const range = getReportRange("2026-06-14", "2026-07-14");

  assert.equal(range.from, "2026-06-14");
  assert.equal(range.to, "2026-07-14");
  assert.equal(range.start.toISOString(), "2026-06-14T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-07-15T00:00:00.000Z");
});

test("legacy month filters remain compatible with report ranges", () => {
  const range = getReportRange("2026-07");

  assert.equal(range.from, "2026-07-01");
  assert.equal(range.to, "2026-07-31");
});

test("report ranges reject impossible and reversed dates", () => {
  assert.throws(
    () => getReportRange("2026-02-30", "2026-03-10"),
    (error) =>
      error instanceof BadRequestException && /valid date/i.test(error.message),
  );
  assert.throws(
    () => getReportRange("2026-07-15", "2026-07-14"),
    (error) =>
      error instanceof BadRequestException && /cannot be after/i.test(error.message),
  );
});
