import { findDuplicateGameByTitle } from "../../utils/gameList.js";

export const emptyGameForm = {
  name: "",
  status: "",
  how_long_to_beat: "",
  my_genre: "",
  thoughts: "",
  my_score: "",
  started_at: "",
  finished_at: "",
  rawg_id: null,
  rawg_slug: "",
  rawg_cover: "",
  rawg_released: "",
};

export const canonDate = (value) =>
  value == null || value === "" ? null : String(value).slice(0, 10);

export const toIntOrNull = (value) =>
  value === "" || value == null
    ? null
    : Number.isNaN(parseInt(value, 10))
      ? null
      : parseInt(value, 10);

export const toNumOrNull = (value) =>
  value === "" || value == null
    ? null
    : Number.isNaN(Number(value))
      ? null
      : Number(value);

const emptyErrors = () => ({ fields: {}, message: "" });

function setFirstMessage(errors, message) {
  if (!errors.message) errors.message = message;
}

export function validateGameDraft(draft, games = []) {
  const errors = emptyErrors();
  const name = String(draft?.name || "").trim();
  const status = draft?.status || "";
  const hltb = draft?.how_long_to_beat;
  const score = draft?.my_score;
  const startedAt = canonDate(draft?.started_at);
  const finishedAt = canonDate(draft?.finished_at);

  if (!name) {
    errors.fields.name = "Name is required.";
    setFirstMessage(errors, "Name and status are required.");
  }

  if (!status) {
    errors.fields.status = "Choose a status.";
    setFirstMessage(errors, "Name and status are required.");
  }

  if (hltb !== "" && hltb != null) {
    const value = Number(hltb);
    if (!Number.isFinite(value) || value < 0 || value > 1000) {
      errors.fields.how_long_to_beat = "Use a number from 0 to 1000.";
      setFirstMessage(errors, "HLTB hours must be between 0 and 1000.");
    }
  }

  if (score !== "" && score != null) {
    const value = Number(score);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      errors.fields.my_score = "Use a score from 0 to 10.";
      setFirstMessage(errors, "My score must be between 0 and 10.");
    }
  }

  if (startedAt && finishedAt && startedAt > finishedAt) {
    errors.fields.finished_at = "Finished date cannot be before started date.";
    setFirstMessage(errors, "Finished date cannot be before started date.");
  }

  if (name && games.length) {
    const duplicate = findDuplicateGameByTitle(name, games);
    if (duplicate) {
      errors.fields.name = `"${duplicate.name}" is already in your backlog.`;
      setFirstMessage(errors, `"${duplicate.name}" is already in your backlog.`);
    }
  }

  return errors.message ? errors : null;
}

export function buildAddGamePayload(draft, games = []) {
  const name = String(draft?.name || "").trim();
  const status = draft?.status || "";

  const errors = validateGameDraft(draft, games);
  if (errors) {
    return { ok: false, message: errors.message, fields: errors.fields };
  }

  const startedAt = canonDate(draft?.started_at);
  const finishedAt = canonDate(draft?.finished_at);
  const payload = { ...draft, name, status };
  if (startedAt) payload.started_at = startedAt;
  else delete payload.started_at;
  if (finishedAt) payload.finished_at = finishedAt;
  else delete payload.finished_at;

  return { ok: true, payload };
}

export function buildEditGamePayload(draft, original = {}) {
  const pick = (snake, camel) =>
    draft?.[snake] !== undefined ? draft[snake] : draft?.[camel];

  const payload = {
    name: pick("name", "name") ?? original.name ?? "",
    status: pick("status", "status") || original.status || "",
    my_genre: pick("my_genre", "myGenre") ?? original.my_genre ?? "",
    thoughts: pick("thoughts", "thoughts") ?? original.thoughts ?? "",
    how_long_to_beat: toIntOrNull(
      pick("how_long_to_beat", "howLongToBeat") ?? original.how_long_to_beat
    ),
    my_score: toNumOrNull(pick("my_score", "myScore") ?? original.my_score),
  };
  const rawgId = pick("rawg_id", "rawgId");
  const rawgSlug = pick("rawg_slug", "rawgSlug");
  if (rawgId !== undefined) payload.rawg_id = rawgId || null;
  if (rawgSlug !== undefined) payload.rawg_slug = rawgSlug || "";

  const startedDraftRaw =
    draft?.started_at !== undefined ? draft.started_at : draft?.startedAt;
  const finishedDraftRaw =
    draft?.finished_at !== undefined ? draft.finished_at : draft?.finishedAt;

  if (startedDraftRaw !== undefined) {
    const next = canonDate(startedDraftRaw);
    const prev = canonDate(original.started_at);
    if (next !== prev) payload.started_at = next;
  }

  if (finishedDraftRaw !== undefined) {
    const next = canonDate(finishedDraftRaw);
    const prev = canonDate(original.finished_at);
    if (next !== prev) payload.finished_at = next;
  }

  const errors = validateGameDraft(
    {
      ...draft,
      name: payload.name,
      status: payload.status,
      how_long_to_beat:
        pick("how_long_to_beat", "howLongToBeat") ?? payload.how_long_to_beat,
      my_score: pick("my_score", "myScore") ?? payload.my_score,
      started_at:
        payload.started_at !== undefined ? payload.started_at : original.started_at,
      finished_at:
        payload.finished_at !== undefined
          ? payload.finished_at
          : original.finished_at,
    },
    []
  );
  if (errors) {
    return { ok: false, message: errors.message, fields: errors.fields };
  }

  return { ok: true, payload };
}

export function apiErrorMessage(error, fallback) {
  const apiError = error?.details?.error;
  return (
    (apiError && typeof apiError === "object" && apiError.message) ||
    (typeof apiError === "string" && apiError) ||
    error?.details?.message ||
    error?.message ||
    fallback
  );
}
