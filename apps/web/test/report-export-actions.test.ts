import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCsv,
  csvCell,
} from "../src/components/reports/report-export-actions";

test("CSV cells neutralize spreadsheet formulas in string values", () => {
  assert.equal(csvCell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(csvCell("  +cmd|' /C calc'!A0"), "'  +cmd|' /C calc'!A0");
  assert.equal(csvCell("-2+3"), "'-2+3");
  assert.equal(csvCell("@SUM(1,2)"), '"\'@SUM(1,2)"');
  assert.equal(csvCell("\t=HYPERLINK(\"https://example.test\")"),
    '"\'\t=HYPERLINK(""https://example.test"")"',
  );
});

test("CSV cells preserve numeric negatives and escape ordinary CSV content", () => {
  assert.equal(csvCell(-1200), "-1200");
  assert.equal(csvCell('Bread, "Large"'), '"Bread, ""Large"""');
});

test("CSV report rows apply formula protection to exported values", () => {
  const csv = buildCsv({
    title: "Sales report",
    sections: [
      {
        title: "Sales",
        rows: [{ Customer: "=WEBSERVICE(\"https://example.test\")" }],
      },
    ],
  });

  assert.match(csv, /"'=WEBSERVICE\(""https:\/\/example\.test""\)"/);
});
