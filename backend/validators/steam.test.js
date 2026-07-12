import test from "node:test";
import assert from "node:assert/strict";
import { steamSchemas } from "./steam.js";

test("Steam status suggestion accepts large game IDs and current review payloads", async () => {
  assert.deepEqual(
    await steamSchemas.gameAchievementParams.validateAsync({ gameId: "6290" }),
    { gameId: 6290 },
  );
  const payload = await steamSchemas.applyStatusSuggestionBody.validateAsync({
    status: "playing",
    setStartedAt: true,
    startedAt: "2026-07-12T10:30:00.000Z",
  });
  assert.equal(payload.status, "playing");
  assert.equal(payload.setStartedAt, true);
  assert.ok(payload.startedAt instanceof Date);
});

test("Steam status suggestion rejects stale non-playing suggestions", async () => {
  await assert.rejects(
    steamSchemas.applyStatusSuggestionBody.validateAsync({
      status: "finished",
      setStartedAt: false,
    }),
    (error) => error?.details?.[0]?.path?.join(".") === "status",
  );
});
