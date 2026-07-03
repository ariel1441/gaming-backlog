import test from "node:test";
import assert from "node:assert/strict";
import { filteredReasonLabel } from "./steamImport.js";

test("filteredReasonLabel maps granular Steam import filter reasons", () => {
  assert.equal(filteredReasonLabel("steam_dlc"), "DLC/add-on");
  assert.equal(filteredReasonLabel("steam_demo"), "Demo/prologue");
  assert.equal(filteredReasonLabel("steam_playtest"), "Playtest/beta");
  assert.equal(filteredReasonLabel("steam_tool"), "Tool/software");
  assert.equal(filteredReasonLabel("possible_non_game"), "Likely non-game");
  assert.equal(filteredReasonLabel("new_reason_from_backend"), "Likely non-game");
});

