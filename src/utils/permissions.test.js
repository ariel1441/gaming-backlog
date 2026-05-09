import test from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteGame,
  canEditGame,
  canReorderGames,
  canTogglePublicProfile,
  isReadOnlyView,
  ownsGame,
} from "./permissions.js";

test("isReadOnlyView treats explicit read-only and public views as read-only", () => {
  assert.equal(isReadOnlyView(), false);
  assert.equal(isReadOnlyView({ readOnly: true }), true);
  assert.equal(isReadOnlyView({ isPublic: true }), true);
});

test("ownsGame requires matching user ownership when user_id is present", () => {
  assert.equal(ownsGame({ id: 1 }, { user_id: 1 }), true);
  assert.equal(ownsGame({ id: "1" }, { user_id: 1 }), true);
  assert.equal(ownsGame({ id: 2 }, { user_id: 1 }), false);
});

test("ownsGame allows rows without user_id for already-authenticated private data", () => {
  assert.equal(ownsGame({ id: 1 }, { id: 10 }), true);
});

test("canEditGame and canDeleteGame require auth, ownership, and writable view", () => {
  const options = {
    user: { id: 1 },
    game: { user_id: 1 },
    isAuthenticated: true,
  };

  assert.equal(canEditGame(options), true);
  assert.equal(canDeleteGame(options), true);
  assert.equal(canEditGame({ ...options, isAuthenticated: false }), false);
  assert.equal(canEditGame({ ...options, readOnly: true }), false);
  assert.equal(canEditGame({ ...options, game: { user_id: 2 } }), false);
});

test("canReorderGames is controlled by auth and read-only state", () => {
  assert.equal(canReorderGames({ isAuthenticated: true }), true);
  assert.equal(canReorderGames({ isAuthenticated: false }), false);
  assert.equal(
    canReorderGames({ isAuthenticated: true, readOnly: true }),
    false
  );
});

test("canTogglePublicProfile is blocked for guests", () => {
  assert.equal(
    canTogglePublicProfile({
      user: { id: 1 },
      isAuthenticated: true,
      isGuest: false,
    }),
    true
  );
  assert.equal(
    canTogglePublicProfile({
      user: { id: 1 },
      isAuthenticated: true,
      isGuest: true,
    }),
    false
  );
});
