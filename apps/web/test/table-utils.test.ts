import assert from "node:assert/strict";
import { test } from "node:test";

import { paginate, pageNumber } from "../src/lib/paginate";
import {
  matchesDateRange,
  matchesSearch,
  matchesSelect,
  optionLabel,
} from "../src/lib/table-filters";
import { formatProductName } from "../src/lib/product-label";

test("pagination clamps invalid and out-of-range page requests", () => {
  assert.equal(pageNumber(undefined), 1);
  assert.equal(pageNumber("0"), 1);
  assert.equal(pageNumber("3"), 3);

  const result = paginate(["a", "b", "c"], 5, 2);

  assert.deepEqual(result, {
    pageItems: ["c"],
    page: 2,
    pageCount: 2,
    total: 3,
    rangeStart: 3,
    rangeEnd: 3,
  });
});

test("table search and select filters match normalized user input", () => {
  assert.equal(matchesSearch(" bread ", ["Full Loaf Bread", "Cash"]), true);
  assert.equal(matchesSearch("transfer", ["Full Loaf Bread", "Cash"]), false);
  assert.equal(matchesSearch("", ["Anything"]), true);
  assert.equal(matchesSelect("all", "CASH"), true);
  assert.equal(matchesSelect("CASH", "CASH"), true);
  assert.equal(matchesSelect("CASH", "TRANSFER"), false);
});

test("date range filters include the full selected day", () => {
  assert.equal(
    matchesDateRange(
      "2026-07-10T22:59:59.000Z",
      "2026-07-10",
      "2026-07-10",
    ),
    true,
  );
  assert.equal(
    matchesDateRange(
      "2026-07-11T00:00:00.000Z",
      "2026-07-10",
      "2026-07-10",
    ),
    false,
  );
  assert.equal(matchesDateRange(null, "", ""), true);
});

test("shared label helpers preserve business-facing labels", () => {
  assert.equal(optionLabel("RETURN_TO_STOCK"), "Return To Stock");
  assert.equal(
    formatProductName({ name: "Full Loaf Bread", size: "Large" }),
    "Full Loaf Bread - Large",
  );
  assert.equal(formatProductName({ name: "Sweets" }), "Sweets");
});
