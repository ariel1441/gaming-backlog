import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROFILE_FIELDS,
  normalizeProfileFields,
  profileDisplayName,
} from "./userProfile.js";

test("normalizeProfileFields fills defaults for missing profile basics", () => {
  assert.deepEqual(normalizeProfileFields(null), DEFAULT_PROFILE_FIELDS);
});

test("normalizeProfileFields keeps valid profile basics", () => {
  assert.deepEqual(
    normalizeProfileFields({
      display_name: "Ariel",
      bio: "Finishing RPGs one long weekend at a time.",
      avatar_icon: "rune",
      avatar_color: "violet",
    }),
    {
      display_name: "Ariel",
      bio: "Finishing RPGs one long weekend at a time.",
      avatar_icon: "rune",
      avatar_color: "violet",
    }
  );
});

test("normalizeProfileFields falls back for unknown avatar choices", () => {
  assert.deepEqual(
    normalizeProfileFields({
      avatar_icon: "elden_ring",
      avatar_color: "neon",
    }),
    DEFAULT_PROFILE_FIELDS
  );
});

test("profileDisplayName prefers display name and falls back to handle", () => {
  assert.equal(profileDisplayName({ username: "ariel", display_name: "Ariel" }), "Ariel");
  assert.equal(profileDisplayName({ username: "ariel", display_name: "" }), "@ariel");
});
