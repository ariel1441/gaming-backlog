import assert from "node:assert/strict";
import test from "node:test";
import { dailyRunStatus } from "./dailyAutomationRunService.js";

const totals = (library, wishlist, wishlist_prices) => ({ library, wishlist, wishlist_prices });
const phase = (status) => ({ succeeded: status === "succeeded" ? 1 : 0, partial: status === "partial" ? 1 : 0, failed: status === "failed" ? 1 : 0, skipped: status === "skipped" ? 1 : 0 });

test("daily run status keeps partial and failed work visible", () => {
  assert.equal(dailyRunStatus(totals(phase("succeeded"), phase("succeeded"), phase("succeeded"))), "succeeded");
  assert.equal(dailyRunStatus(totals(phase("succeeded"), phase("partial"), phase("succeeded"))), "partial");
  assert.equal(dailyRunStatus(totals(phase("failed"), phase("failed"), phase("failed"))), "failed");
  assert.equal(dailyRunStatus(totals(phase("skipped"), phase("skipped"), phase("skipped"))), "skipped");
});
