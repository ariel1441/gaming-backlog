import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useMedia from "../../hooks/useMedia";
import {
  Button,
  Field,
  GameCover,
  Modal,
  Sheet,
  Textarea,
  TextInput,
  useConfirm,
} from "../../components/ui";
import { apiErrorMessage } from "./backlogForm";
import { statusDisplayLabel } from "../../utils/statusDisplay";

function appToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function initialDraft(game) {
  return {
    finished_at: game?.finished_at
      ? String(game.finished_at).slice(0, 10)
      : appToday(),
    my_score: game?.my_score ?? "",
    thoughts: game?.thoughts || "",
  };
}

function validate(draft, game) {
  const fields = {};
  const score = draft.my_score;
  const startedAt = game?.started_at
    ? String(game.started_at).slice(0, 10)
    : "";

  if (!draft.finished_at) fields.finished_at = "Choose a finish date.";
  if (startedAt && draft.finished_at && draft.finished_at < startedAt) {
    fields.finished_at =
      "Finish date cannot be before the recorded start date.";
  }
  if (
    score !== "" &&
    (!Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 10)
  ) {
    fields.my_score = "Use a score from 0 to 10.";
  }
  if (draft.thoughts.length > 2000) {
    fields.thoughts = "Keep your thoughts to 2,000 characters or fewer.";
  }
  return fields;
}

export default function FinishGameFlow({
  game,
  onClose,
  onSubmit,
  onFinished,
}) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isMobile = useMedia("(max-width: 640px)");
  const [draft, setDraft] = useState(() => initialDraft(game));
  const [fields, setFields] = useState({});
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [finishedGame, setFinishedGame] = useState(null);

  useEffect(() => {
    setDraft(initialDraft(game));
    setFields({});
    setMessage("");
    setOutcome("");
    setFinishedGame(null);
  }, [game?.id]);

  const initial = useMemo(() => initialDraft(game), [game]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  if (!game) return null;

  const requestClose = async () => {
    if (isSubmitting) return;
    if (!outcome && dirty) {
      const discard = await confirm({
        title: "Discard completion details?",
        message: "Your game has not been changed.",
        confirmLabel: "Discard details",
        tone: "primary",
      });
      if (!discard) return;
    }
    onClose?.();
  };

  const submit = async () => {
    if (isSubmitting) return;
    const nextFields = validate(draft, game);
    if (Object.keys(nextFields).length) {
      setFields(nextFields);
      setMessage("Check the highlighted fields.");
      return;
    }

    setIsSubmitting(true);
    setFields({});
    setMessage("");
    try {
      const response = await onSubmit({
        finished_at: draft.finished_at,
        my_score: draft.my_score === "" ? null : Number(draft.my_score),
        thoughts: draft.thoughts.trim() || null,
      });
      const updated = response?.game || game;
      setFinishedGame(updated);
      setOutcome(response?.outcome || "finished");
      onFinished?.(updated);
    } catch (error) {
      setMessage(
        apiErrorMessage(
          error,
          "Couldn’t finish this game. Your changes weren’t saved. Try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    outcome === "already_finished"
      ? "Already finished"
      : outcome
        ? "Game finished"
        : `Finish ${game.displayName || game.name}`;
  const description = outcome
    ? undefined
    : "Mark this game Finished and save a few final details. Everything here is private.";

  const body = outcome ? (
    <div className="flex min-h-64 flex-col items-center justify-center px-2 py-8 text-center">
      <div className="finish-success-icon flex h-20 w-20 items-center justify-center rounded-full border border-state-success/45 bg-state-success/15 text-state-success shadow-lg shadow-state-success/10">
        <CheckCircle2 className="h-11 w-11" aria-hidden="true" />
      </div>
      <div className="mt-5" role="status" aria-live="polite">
        <h3 className="text-xl font-semibold text-content-primary">
          {outcome === "already_finished"
            ? "This game was already marked Finished."
            : `${finishedGame?.displayName || finishedGame?.name || game.name} is now Finished.`}
        </h3>
        <p className="mt-2 text-sm leading-6 text-content-muted">
          {outcome === "already_finished"
            ? "We refreshed it with the latest saved details."
            : "Your completion details have been saved."}
        </p>
      </div>
    </div>
  ) : (
    <div className="space-y-5">
      <div className="flex min-w-0 items-center gap-4 rounded-panel border border-state-success/25 bg-state-success/8 p-3">
        <GameCover
          src={game.cover}
          name={game.displayName || game.name}
          className="h-20 w-14 shrink-0 rounded-control border border-surface-border"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-state-success">
            <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Ready to wrap this one up?</span>
          </div>
          <p className="mt-1 break-words text-sm text-content-secondary">
            {statusDisplayLabel(game.status)} → Finished
          </p>
          {!game.started_at ? (
            <p className="mt-1 text-xs leading-5 text-content-muted">
              No start date is recorded. That’s okay—we won’t add one.
            </p>
          ) : null}
        </div>
      </div>

      {message ? (
        <p
          className="rounded-control border border-state-error/35 bg-state-error/10 px-3 py-2 text-sm text-state-error"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="finish-game-date"
          label="Finish date"
          error={fields.finished_at}
          required
        >
          <TextInput
            id="finish-game-date"
            type="date"
            value={draft.finished_at}
            disabled={isSubmitting}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                finished_at: event.target.value,
              }))
            }
            className="[color-scheme:dark]"
          />
        </Field>
        <Field
          id="finish-game-score"
          label="My score"
          help="Optional · 0–10"
          error={fields.my_score}
        >
          <TextInput
            id="finish-game-score"
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={draft.my_score}
            disabled={isSubmitting}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                my_score: event.target.value,
              }))
            }
            placeholder="0–10"
          />
        </Field>
      </div>

      <Field
        id="finish-game-thoughts"
        label="Your thoughts"
        help={`Optional · A short private reflection or review. ${draft.thoughts.length}/2000`}
        error={fields.thoughts}
      >
        <Textarea
          id="finish-game-thoughts"
          rows={5}
          maxLength={2000}
          value={draft.thoughts}
          disabled={isSubmitting}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              thoughts: event.target.value,
            }))
          }
          placeholder="What stayed with you about this game?"
        />
      </Field>
    </div>
  );

  const footer = outcome ? (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          onClose?.();
          navigate("/next-up");
        }}
      >
        Choose what to play next
      </Button>
      <Button type="button" variant="success" onClick={onClose}>
        Done
      </Button>
    </>
  ) : (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={onClose}
        disabled={isSubmitting}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="success"
        onClick={() => void submit()}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {isSubmitting ? "Finishing…" : "Finish game"}
      </Button>
    </>
  );

  return isMobile ? (
    <Sheet
      open
      title={title}
      description={description}
      onClose={() => void requestClose()}
      closeDisabled={isSubmitting}
      footer={<div className="flex flex-col-reverse gap-2 min-[420px]:flex-row min-[420px]:justify-end">{footer}</div>}
    >
      {body}
    </Sheet>
  ) : (
    <Modal
      open
      title={title}
      description={description}
      onClose={() => void requestClose()}
      closeDisabled={isSubmitting}
      size="sm"
      footer={footer}
    >
      {body}
    </Modal>
  );
}
