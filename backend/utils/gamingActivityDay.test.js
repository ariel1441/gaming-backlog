import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGamingActivityInterval,
  gamingActivityCloseoutDay,
  gamingActivityDay,
  isGamingActivityCloseoutHour,
} from "./gamingActivityDay.js";

test("gaming activity day uses the 05:00 Jerusalem cutoff", () => {
  assert.equal(gamingActivityDay("2026-09-19T01:30:00+03:00"), "2026-09-18");
  assert.equal(gamingActivityDay("2026-09-26T04:59:59+03:00"), "2026-09-25");
  assert.equal(gamingActivityDay("2026-09-19T05:00:00+03:00"), "2026-09-19");
  assert.equal(gamingActivityDay("2026-12-26T04:59:59+02:00"), "2026-12-25");
  assert.equal(gamingActivityDay("2026-12-26T05:00:00+02:00"), "2026-12-26");
  assert.equal(gamingActivityDay("invalid"), null);
});

test("daily closeouts and extra observations receive one canonical activity day", () => {
  assert.deepEqual(
    classifyGamingActivityInterval(
      "2026-09-18T05:03:00+03:00",
      "2026-09-19T05:02:00+03:00",
    ),
    { precision: "daily", activityDay: "2026-09-18" },
  );
  assert.deepEqual(
    classifyGamingActivityInterval(
      "2026-09-19T05:02:00+03:00",
      "2026-09-19T23:00:00+03:00",
    ),
    { precision: "daily", activityDay: "2026-09-19" },
  );
});

test("missed activity days stay uncertain instead of being split", () => {
  assert.deepEqual(
    classifyGamingActivityInterval(
      "2026-09-18T05:00:00+03:00",
      "2026-09-21T05:00:00+03:00",
    ),
    { precision: "uncertain", activityDay: null },
  );
});

test("Jerusalem DST changes do not turn consecutive closeouts into gaps", () => {
  assert.deepEqual(
    classifyGamingActivityInterval(
      "2026-10-24T05:00:00+03:00",
      "2026-10-25T05:00:00+02:00",
    ),
    { precision: "daily", activityDay: "2026-10-24" },
  );
  assert.deepEqual(
    classifyGamingActivityInterval(
      "2026-03-26T05:00:00+02:00",
      "2026-03-27T05:00:00+03:00",
    ),
    { precision: "daily", activityDay: "2026-03-26" },
  );
});

test("Jerusalem closeout gate selects one of the paired UTC cron runs across DST", () => {
  assert.equal(isGamingActivityCloseoutHour("2026-09-24T02:04:00Z"), true);
  assert.equal(isGamingActivityCloseoutHour("2026-09-24T03:04:00Z"), false);
  assert.equal(isGamingActivityCloseoutHour("2026-12-24T02:04:00Z"), false);
  assert.equal(isGamingActivityCloseoutHour("2026-12-24T03:04:00Z"), true);

  assert.equal(isGamingActivityCloseoutHour("2026-03-26T03:04:00Z"), true);
  assert.equal(isGamingActivityCloseoutHour("2026-03-27T02:04:00Z"), true);
  assert.equal(isGamingActivityCloseoutHour("2026-03-27T03:04:00Z"), false);
  assert.equal(isGamingActivityCloseoutHour("2026-10-24T02:04:00Z"), true);
  assert.equal(isGamingActivityCloseoutHour("2026-10-24T03:04:00Z"), false);
  assert.equal(isGamingActivityCloseoutHour("2026-10-25T02:04:00Z"), false);
  assert.equal(isGamingActivityCloseoutHour("2026-10-25T03:04:00Z"), true);
  assert.equal(isGamingActivityCloseoutHour("invalid"), false);
  assert.equal(gamingActivityCloseoutDay("2026-09-24T02:04:00Z"), "2026-09-23");
  assert.equal(gamingActivityCloseoutDay("2026-12-24T03:04:00Z"), "2026-12-23");
  assert.equal(gamingActivityCloseoutDay("2026-12-24T02:04:00Z"), null);
});
