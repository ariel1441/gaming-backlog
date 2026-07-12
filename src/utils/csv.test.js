import assert from "node:assert/strict";
import test from "node:test";
import { backlogCsv, csvValue } from "./csv.js";

test("CSV neutralizes spreadsheet formulas while preserving numeric values", () => {
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "  =1", "\t=1", "\r=1"]) {
    assert.match(csvValue(value), /^"?'?/);
    assert.ok(csvValue(value).replace(/^"/, "").startsWith("'"));
  }
  assert.equal(csvValue(-12), "-12");
  assert.equal(csvValue(42), "42");
});

test("CSV retains quotes, commas, Unicode, multiline text, and CRLF rows", () => {
  assert.equal(csvValue('hello, "world"'), '"hello, ""world"""');
  assert.equal(csvValue("שלום\nworld"), '"שלום\nworld"');
  const csv = backlogCsv([{ id: 1, name: "=2+2", thoughts: "one\ntwo" }]);
  assert.ok(csv.includes("'=2+2"));
  assert.ok(csv.endsWith("\r\n"));
});
