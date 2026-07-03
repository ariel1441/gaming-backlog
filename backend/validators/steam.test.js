import test from "node:test";
import assert from "node:assert/strict";
import { steamSchemas } from "./steam.js";

test("Steam import query validates filters and coerces pagination", () => {
  const { value, error } = steamSchemas.importCandidatesQuery.validate({
    status: "active",
    group: "matched",
    achievement: "close",
    sort: "playtime_desc",
    q: "  hades  ",
    limit: "50",
    offset: "10",
  });

  assert.equal(error, undefined);
  assert.equal(value.q, "hades");
  assert.equal(value.limit, 50);
  assert.equal(value.offset, 10);
  assert.equal(value.sort, "playtime_desc");
  assert.match(
    steamSchemas.importCandidatesQuery.validate({ achievement: "rare" }).error.message,
    /must be one of/
  );
});

test("Steam achievement batch body bounds sync limit", () => {
  assert.equal(
    steamSchemas.achievementBatchBody.validate({ force: true, limit: 250 }).error,
    undefined
  );
  assert.match(
    steamSchemas.achievementBatchBody.validate({ limit: 251 }).error.message,
    /less than or equal to 250/
  );
});

test("Steam candidate update body requires action-specific payload", () => {
  assert.equal(
    steamSchemas.updateCandidateBody.validate({ action: "ignore" }).error,
    undefined
  );
  assert.match(
    steamSchemas.updateCandidateBody.validate({ action: "set_status" }).error.message,
    /status/
  );
  assert.match(
    steamSchemas.updateCandidateBody.validate({ action: "select_catalog" }).error.message,
    /catalog_game_id/
  );
});

test("Steam bulk and import bodies require ids or scope", () => {
  assert.equal(
    steamSchemas.bulkCandidateBody.validate({
      action: "accept",
      candidateIds: [1, 2],
    }).error,
    undefined
  );
  assert.match(
    steamSchemas.bulkCandidateBody.validate({
      action: "accept",
      candidateIds: [1, 1],
    }).error.message,
    /duplicate/
  );
  assert.match(
    steamSchemas.importBody.validate({}).error.message,
    /must contain at least one of/
  );
});

test("Steam route params validate positive ids and Steam app ids", () => {
  assert.equal(
    steamSchemas.unlinkParams.validate({ gameId: "12", steamAppId: "123456" }).error,
    undefined
  );
  assert.match(
    steamSchemas.unlinkParams.validate({ gameId: 0, steamAppId: "abc" }).error.message,
    /must be/
  );
});
