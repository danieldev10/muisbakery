import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dateRangeFilter,
  paginatedResult,
  parsePagination,
} from "../src/common/pagination";

test("parsePagination clamps invalid input and caps large page sizes", () => {
  assert.deepEqual(parsePagination({ page: "3", pageSize: "25" }), {
    page: 3,
    pageSize: 25,
    skip: 50,
    take: 25,
  });

  assert.deepEqual(parsePagination({ page: "-1", pageSize: "1000" }), {
    page: 1,
    pageSize: 100,
    skip: 0,
    take: 100,
  });
});

test("paginatedResult reports the visible range for table pagination", () => {
  assert.deepEqual(paginatedResult(["a", "b"], 12, 2, 10), {
    items: ["a", "b"],
    pagination: {
      page: 2,
      pageCount: 2,
      pageSize: 10,
      total: 12,
      rangeStart: 11,
      rangeEnd: 12,
    },
  });
});

test("dateRangeFilter includes the full selected end day", () => {
  const filter = dateRangeFilter("2026-07-10", "2026-07-11");

  assert.equal(filter?.gte?.toISOString(), "2026-07-10T00:00:00.000Z");
  assert.equal(filter?.lte?.toISOString(), "2026-07-11T23:59:59.999Z");
});
