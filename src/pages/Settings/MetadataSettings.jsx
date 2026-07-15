import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  DatabaseZap,
  RefreshCw,
  Search,
  SkipForward,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Modal,
  Skeleton,
  TextInput,
  useToast,
} from "../../components/ui";
import { searchGames } from "../../services/gameService";
import {
  decideMetadataCandidate,
  getLatestMetadataRepair,
  listMetadataCandidates,
  selectGameMetadata,
  startMetadataRepair,
} from "../../services/metadataService";
import {
  firstHighConfidenceCandidates,
  groupMetadataCandidates,
  METADATA_REVIEW_BATCH_LIMIT,
  metadataJobProgress,
} from "../../utils/metadataRepair";

function CandidateArtwork({ candidate }) {
  const [failed, setFailed] = useState(false);
  if (!candidate.cover || failed) {
    return (
      <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-elevated text-content-muted">
        <DatabaseZap className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={candidate.cover}
      alt=""
      className="h-24 w-20 shrink-0 rounded-lg border border-surface-border object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function SearchArtwork({ result }) {
  const [failed, setFailed] = useState(false);
  if (!result.cover || failed) {
    return <div className="h-14 w-11 shrink-0 rounded bg-surface-elevated" />;
  }
  return (
    <img
      src={result.cover}
      alt=""
      className="h-14 w-11 shrink-0 rounded object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function CandidateCard({
  candidate,
  busy,
  selected,
  onSelect,
  onAccept,
  onReject,
}) {
  return (
    <article className="rounded-xl border border-surface-border bg-surface-bg/35 p-3">
      <div className="flex gap-3">
        <CandidateArtwork candidate={candidate} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="break-words text-sm font-semibold text-content-primary">
                {candidate.candidateName}
              </h4>
              <p className="mt-1 text-xs text-content-muted">
                {candidate.released || "Release date unavailable"}
              </p>
            </div>
            <Badge
              variant={candidate.confidenceLevel === "high" ? "success" : "warning"}
            >
              {candidate.confidenceLevel} match
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
            <span>RAWG {candidate.rating ?? "—"}</span>
            <span>Metacritic {candidate.metacritic ?? "—"}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Checkbox
              checked={selected}
              disabled={busy}
              onChange={(checked) => onSelect(candidate, checked)}
              label="Add to batch"
              ariaLabel={`Add ${candidate.candidateName} to batch`}
              className="mr-1 self-center"
            />
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => onAccept(candidate)}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Use this match
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onReject(candidate)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Not this one
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AlternativeSearch({ group, busy, onSelect }) {
  const toast = useToast();
  const [query, setQuery] = useState(group.gameName);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    const value = query.trim();
    if (value.length < 3) {
      toast.warning("Enter at least 3 characters.");
      return;
    }
    try {
      setSearching(true);
      const payload = await searchGames(value);
      setResults(payload?.results || []);
    } catch (error) {
      toast.error(error?.message || "Could not search RAWG.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="rounded-xl border border-metadata-border/60 bg-metadata-surface/30 p-3">
      <div className="text-sm font-semibold text-content-primary">
        Search for another edition
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          placeholder="Search RAWG"
          aria-label={`Search alternatives for ${group.gameName}`}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy || searching}
          onClick={search}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {searching ? "Searching..." : "Search"}
        </Button>
      </div>
      {results.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {results.slice(0, 8).map((result) => (
            <button
              key={result.rawg_id}
              type="button"
              disabled={busy}
              onClick={() => onSelect(group, result)}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-surface-border bg-surface-card p-2 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated disabled:opacity-60"
            >
              <SearchArtwork result={result} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-content-primary">
                  {result.name}
                </span>
                <span className="mt-1 block text-xs text-content-muted">
                  {result.released || "Date unavailable"}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewModal({ open, candidates, loading, onClose, onChanged, refreshGames }) {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState("");
  const [selectedByGame, setSelectedByGame] = useState({});
  const [batchProgress, setBatchProgress] = useState("");
  const groups = useMemo(() => groupMetadataCandidates(candidates), [candidates]);
  const selectedCandidates = Object.values(selectedByGame);

  useEffect(() => {
    const available = new Set(candidates.map((candidate) => String(candidate.id)));
    setSelectedByGame((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, candidate]) =>
          available.has(String(candidate.id)),
        ),
      ),
    );
  }, [candidates]);

  const mutate = async (key, action, success, refreshBacklog = false) => {
    try {
      setBusyKey(key);
      await action();
      toast.success(success);
      await Promise.all([
        onChanged(),
        refreshBacklog ? refreshGames() : Promise.resolve(),
      ]);
    } catch (error) {
      toast.error(error?.message || "Could not update metadata.");
    } finally {
      setBusyKey("");
    }
  };

  const toggleSelected = (candidate, checked) => {
    setSelectedByGame((current) => {
      const key = String(candidate.gameId);
      if (!checked) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      if (!current[key] && Object.keys(current).length >= METADATA_REVIEW_BATCH_LIMIT) {
        toast.warning(`Choose up to ${METADATA_REVIEW_BATCH_LIMIT} games per batch.`);
        return current;
      }
      return { ...current, [key]: candidate };
    });
  };

  const selectHighConfidence = () => {
    const selections = firstHighConfidenceCandidates(groups);
    setSelectedByGame(
      Object.fromEntries(
        selections.map((candidate) => [String(candidate.gameId), candidate]),
      ),
    );
    if (!selections.length) {
      toast.info("No first suggestions marked high confidence are loaded.");
    }
  };

  const applySelected = async () => {
    const selections = Object.values(selectedByGame);
    if (!selections.length) return;
    let applied = 0;
    let failed = 0;
    setBusyKey("batch");
    try {
      for (const [index, candidate] of selections.entries()) {
        setBatchProgress(`Applying ${index + 1} of ${selections.length}`);
        try {
          await decideMetadataCandidate(candidate.id, "accept");
          applied += 1;
        } catch {
          failed += 1;
        }
      }
      await Promise.all([onChanged(), refreshGames()]);
      if (applied) toast.success(`${applied} metadata matches linked.`);
      if (failed) toast.error(`${failed} matches could not be linked.`);
    } catch (error) {
      toast.error(error?.message || "Matches were applied, but the review list could not refresh.");
    } finally {
      setBatchProgress("");
      setBusyKey("");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="3xl"
      title="Review metadata matches"
      description="Choose only identities you recognize. Nothing is linked from a title guess without your approval."
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !groups.length ? (
        <EmptyState
          icon={Check}
          title="No matches need review."
          description="Run repair again later if unmatched games remain."
        />
      ) : (
        <div className="space-y-5">
          <div className="sticky top-0 z-10 rounded-xl border border-surface-border bg-surface-card/95 p-3 shadow-panel backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-content-muted">
                <span className="font-semibold text-content-primary">
                  {groups.length} backlog games
                </span>{" "}
                · {candidates.length} suggestions loaded
                <div className="mt-1 text-xs">
                  Selects up to {METADATA_REVIEW_BATCH_LIMIT} games. Confirm the
                  choices before applying.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!!busyKey}
                  onClick={selectHighConfidence}
                >
                  Select first high matches
                </Button>
                {selectedCandidates.length ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!!busyKey}
                    onClick={() => setSelectedByGame({})}
                  >
                    Clear
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={!!busyKey || !selectedCandidates.length}
                  onClick={applySelected}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {batchProgress || `Apply selected (${selectedCandidates.length})`}
                </Button>
              </div>
            </div>
          </div>
          {groups.map((group) => (
            <section
              key={group.gameId}
              className="rounded-2xl border border-surface-border bg-surface-elevated/30 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Your backlog game
                  </div>
                  <h3 className="mt-1 break-words text-lg font-semibold text-content-primary">
                    {group.gameName}
                  </h3>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!!busyKey}
                  onClick={() =>
                    mutate(
                      `skip-${group.gameId}`,
                      () => decideMetadataCandidate(group.candidates[0].id, "skip"),
                      "Game skipped for now.",
                    )
                  }
                >
                  <SkipForward className="h-4 w-4" aria-hidden="true" />
                  Skip game
                </Button>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {group.candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    busy={!!busyKey}
                    selected={selectedByGame[String(group.gameId)]?.id === candidate.id}
                    onSelect={toggleSelected}
                    onAccept={(selected) =>
                      mutate(
                        `accept-${selected.id}`,
                        () => decideMetadataCandidate(selected.id, "accept"),
                        "Metadata linked.",
                        true,
                      )
                    }
                    onReject={(selected) =>
                      mutate(
                        `reject-${selected.id}`,
                        () => decideMetadataCandidate(selected.id, "reject"),
                        "Candidate removed.",
                      )
                    }
                  />
                ))}
              </div>
              <div className="mt-3">
                <AlternativeSearch
                  group={group}
                  busy={!!busyKey}
                  onSelect={(selectedGroup, result) =>
                    mutate(
                      `manual-${selectedGroup.gameId}`,
                      () => selectGameMetadata(selectedGroup.gameId, result.rawg_id),
                      "Selected metadata linked.",
                      true,
                    )
                  }
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function MetadataSettings({ games, isGuest, refreshGames }) {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(!isGuest);
  const [starting, setStarting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const refreshedCompletionRef = useRef("");

  const loadStatus = useCallback(async () => {
    if (isGuest) return null;
    const payload = await getLatestMetadataRepair();
    setStatus(payload);
    return payload;
  }, [isGuest]);

  const loadCandidates = useCallback(async ({ silent = false } = {}) => {
    if (isGuest) return;
    try {
      if (!silent) setCandidatesLoading(true);
      const payload = await listMetadataCandidates();
      setCandidates(payload?.candidates || []);
    } finally {
      if (!silent) setCandidatesLoading(false);
    }
  }, [isGuest]);

  useEffect(() => {
    if (isGuest) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    loadStatus()
      .catch((error) => {
        if (!cancelled) toast.error(error?.message || "Could not load metadata status.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, loadStatus, toast]);

  const progress = metadataJobProgress(status?.job);
  useEffect(() => {
    if (!progress.active) return undefined;
    const timer = window.setInterval(() => {
      loadStatus().catch(() => {});
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, progress.active]);

  useEffect(() => {
    const job = status?.job;
    if (job?.status !== "completed") return;
    const key = `${job.id}:${job.completedAt || "completed"}`;
    if (refreshedCompletionRef.current === key) return;
    refreshedCompletionRef.current = key;
    refreshGames().catch(() => {});
  }, [refreshGames, status?.job]);

  const start = async () => {
    try {
      setStarting(true);
      const payload = await startMetadataRepair();
      setStatus((current) => ({
        ...current,
        job: payload.job,
        pendingCandidateCount: current?.pendingCandidateCount || 0,
        pendingReviewGameCount: current?.pendingReviewGameCount || 0,
      }));
      toast.success("Metadata repair started.");
    } catch (error) {
      toast.error(error?.message || "Could not start metadata repair.");
    } finally {
      setStarting(false);
    }
  };

  const openReview = async () => {
    setReviewOpen(true);
    try {
      await loadCandidates();
    } catch (error) {
      toast.error(error?.message || "Could not load metadata matches.");
    }
  };

  const reviewChanged = async () => {
    await Promise.all([loadCandidates({ silent: true }), loadStatus()]);
  };

  const pendingCandidates = Number(status?.pendingCandidateCount || 0);
  const pendingGames = Number(
    status?.pendingReviewGameCount ?? status?.pendingCandidateCount ?? 0,
  );
  const job = status?.job;
  const incomplete = games.filter(
    (game) => !game.catalog_game_id || game.metadataQuality === "search_result",
  ).length;

  return (
    <>
      <section className="rounded-panel border border-surface-border bg-surface-card p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <DatabaseZap className="h-5 w-5 text-content-muted" aria-hidden="true" />
              Game metadata
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-content-muted">
              Find durable RAWG metadata for incomplete backlog games. Exact IDs
              are repaired automatically; title matches always wait for review.
            </p>
          </div>
          <Badge variant={pendingGames ? "warning" : incomplete ? "metadata" : "success"}>
            {pendingGames ? `${pendingGames} games to review` : `${incomplete} incomplete`}
          </Badge>
        </div>

        {isGuest ? (
          <div className="mt-5 rounded-xl border border-surface-border bg-surface-bg/35 p-4 text-sm text-content-muted">
            Metadata repair is unavailable in temporary demo sessions.
          </div>
        ) : loading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-10 w-56" />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {job ? (
              <div className="rounded-xl border border-surface-border bg-surface-bg/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium capitalize text-content-primary">
                    {job.status === "completed" ? "Last repair completed" : `Repair ${job.status}`}
                  </span>
                  <span className="text-content-muted">
                    {progress.processed} of {progress.total} checked
                  </span>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-surface-elevated"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-content-muted">
                  <span>{job.linkedCount} repaired</span>
                  <span>{job.reviewCount} sent to review</span>
                  <span>{job.unmatchedCount} unmatched</span>
                  {job.failedCount ? <span>{job.failedCount} failed</span> : null}
                </div>
                {pendingGames ? (
                  <div className="mt-3 text-xs text-content-muted">
                    {pendingCandidates} suggestions across {pendingGames} backlog games await review.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-surface-border bg-surface-bg/35 p-4 text-sm leading-6 text-content-muted">
                No repair has run yet. The job works in the background and normal
                backlog loading remains database-only.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={starting || progress.active}
                onClick={start}
              >
                <RefreshCw
                  className={`h-4 w-4 ${progress.active ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {progress.active ? "Repair running" : starting ? "Starting..." : "Repair missing metadata"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!pendingGames}
                onClick={openReview}
              >
                Review matches
                {pendingGames ? <Badge variant="warning">{pendingGames}</Badge> : null}
              </Button>
            </div>
          </div>
        )}
      </section>

      <ReviewModal
        open={reviewOpen}
        candidates={candidates}
        loading={candidatesLoading}
        onClose={() => setReviewOpen(false)}
        onChanged={reviewChanged}
        refreshGames={refreshGames}
      />
    </>
  );
}
