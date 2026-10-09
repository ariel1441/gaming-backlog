import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseCsv, mergeSnapshot, replaceCache } from "./import-hltb-cache.js";

const old = (name = "Game") => ({ game_game_name: name, game_comp_main_med: 3600, game_comp_plus_med: 7200, game_comp_all_med: 10800 });
const source = (name = "Game", id = "1", extra = {}) => ({ id, name, main_story: "2.5", main_plus_sides: "4", completionist: "6", source_url: `https://howlongtobeat.com/game/${id}`, crawled_at: "2026-03-27T10:00:00Z", ...extra });

test("CSV preserves embedded commas, quotes, newlines and BOM", () => {
  const rows = parseCsv('\uFEFFid,name,main_story,main_plus_sides,completionist,source_url,crawled_at\r\n1,"Game, ""One""\nPart 2",1.5,,,https://howlongtobeat.com/game/1,2026-03-27\r\n');
  assert.equal(rows[0].name, 'Game, "One"\nPart 2');
  assert.equal(rows[0].main_story, "1.5");
  assert.throws(() => parseCsv('id,name\n1,"Broken'), /Unterminated/);
  assert.throws(() => parseCsv('name,time\nGame,5'), /Unsupported/);
});

test("refresh uses averages in seconds, retains missing metrics and absent games", () => {
  const { rows, report } = mergeSnapshot([old(), old("Absent")], [source("Game", "1", { main_plus_sides: "" }), source("New", "2")]);
  assert.equal(rows[0].game_comp_main_med, undefined);
  assert.equal(rows[0].game_comp_main_avg, 9000);
  assert.equal(rows[0].game_comp_plus_med, 7200);
  assert.deepEqual(rows[0].hltb_legacy_fallback_fields, ["plus"]);
  assert.deepEqual(rows[1], old("Absent"));
  assert.equal(report.added, 1);
  assert.equal(report.refreshed, 1);
  assert.equal(report.legacyFallbackMetrics, 1);
});

test("ambiguous titles and changed identities never silently overwrite estimates", () => {
  const current = { ...old(), hltb_id: 9 };
  assert.deepEqual(mergeSnapshot([current], [source()]).rows, [current]);
  const collision = mergeSnapshot([old("Game-II")], [source("Game II"), source("Game 2", "2")]);
  assert.deepEqual(collision.rows, [old("Game-II")]);
  assert.equal(collision.report.ambiguousTitles, 1);
  const legacyCollision = [old("Game II"), old("Game 2")];
  assert.deepEqual(mergeSnapshot(legacyCollision, [source("Game II")]).rows, legacyCollision);
});

test("invalid snapshots fail; newer existing snapshots cannot be downgraded", () => {
  for (const extra of [{ main_story: "oops" }, { main_story: "-1" }, { source_url: "https://example.com" }, { crawled_at: "bad" }]) {
    assert.throws(() => mergeSnapshot([old()], [source("Game", "1", extra)]));
  }
  assert.throws(() => mergeSnapshot([old()], [source(), source()]), /duplicate/);
  assert.throws(() => mergeSnapshot([old()], [source("Game", "1", { main_story: "", main_plus_sides: "0", completionist: "" })]), /no supported/);
  assert.throws(() => mergeSnapshot([{ ...old(), hltb_crawled_at: "2026-04-01" }], [source()]), /older snapshot/);
});

test("repeat refresh is idempotent, numeric titles work, and blank rows do not erase data", () => {
  const input = [source(), source("1924", "2")];
  const first = mergeSnapshot([old(), old(1924)], input);
  const second = mergeSnapshot(first.rows, input);
  assert.deepEqual(second.rows, first.rows);
  assert.equal(second.report.refreshed, 0);
  assert.equal(second.report.unchanged, 2);
  const blank = source("Game", "1", { main_story: "", main_plus_sides: "", completionist: "" });
  assert.deepEqual(mergeSnapshot([old()], [blank, source("Other", "3")]).rows[0], old());
});

test("actual app loader supports all three averages and preserves median precedence", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "hltb-contract-"));
  const file = path.join(folder, "cache.json");
  const code = `import {loadHLTBLocal,lookupHLTBHoursByPref} from './backend/utils/hltb.js'; const app={locals:{}}; await loadHLTBLocal(app); console.log(JSON.stringify(['main','plus','comp'].map(pref=>lookupHLTBHoursByPref(app,'Game',pref))));`;
  try {
    for (const data of [
      [{ game_game_name: "Game", game_comp_main_avg: 9000, game_comp_plus_avg: 14400, game_comp_all_avg: 21600 }],
      { Game: { game_comp_main_avg: 9000, game_comp_plus_avg: 14400, game_comp_all_avg: 21600 } },
      [{ game_game_name: "Game", game_comp_main_med: 10800, game_comp_main_avg: 7200, game_comp_plus_med: 14400, game_comp_all_med: 21600 }],
    ]) {
      await fs.writeFile(file, JSON.stringify(data));
      const result = execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, HLTB_DATA_PATH: file, HLTB_UNITS: "seconds" }, encoding: "utf8" });
      assert.deepEqual(JSON.parse(result), [3, 4, 6]);
    }
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("cache replacement keeps rollback copies, detects concurrent edits, and supports future refreshes", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "hltb-replace-"));
  const file = path.join(folder, "cache.json");
  try {
    await fs.writeFile(file, "old");
    await assert.rejects(replaceCache(file, "stale", "new"), /Cache changed/);
    assert.equal(await fs.readFile(file, "utf8"), "old");
    await replaceCache(file, "old", "new");
    await replaceCache(file, "new", "new");
    assert.equal((await fs.readdir(folder)).length, 2);
    await replaceCache(file, "new", "newer");
    assert.equal(await fs.readFile(file, "utf8"), "newer");
    const backups = (await fs.readdir(folder)).filter((name) => name.endsWith(".bak"));
    assert.equal(backups.length, 2);
    assert.deepEqual((await Promise.all(backups.map((name) => fs.readFile(path.join(folder, name), "utf8")))).sort(), ["new", "old"]);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("a unique exact legacy title resolves a Roman/numeric alias while duplicate exact names stay ambiguous", () => {
  const aliases = [source("Hades II"), source("Hades 2", "2")];
  const result = mergeSnapshot([old("Hades II")], aliases);
  assert.equal(result.rows[0].hltb_id, 1);
  assert.equal(result.report.resolvedExactTitles, 1);
  assert.equal(result.report.refreshed, 1);
  const duplicateNames = [source("Hades II"), source("Hades II", "2")];
  assert.deepEqual(mergeSnapshot([old("Hades II")], duplicateNames).rows, [old("Hades II")]);
  assert.deepEqual(mergeSnapshot([old("Other")], aliases).rows, [old("Other")]);
});
