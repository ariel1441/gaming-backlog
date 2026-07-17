import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight,
  Grid2X2,
  LibraryBig,
  List,
  ListPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import GameModal from "../../components/GameModal";
import { AppPage, PageError } from "../../components/layout";
import {
  ActionMenu,
  Button,
  EmptyState,
  Field,
  Modal,
  SegmentedControl,
  Skeleton,
  Textarea,
  TextInput,
  useConfirm,
  useToast,
} from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import { useGames } from "../../hooks/useGames";
import {
  addGameToList,
  deleteUserList,
  getUserList,
  removeGameFromList,
  reorderListGames,
  updateUserList,
} from "../../services/listService";
import {
  describeSmartQuery,
  normalizeSmartQuery,
  normalizeSmartSortKey,
  resolveSmartList,
} from "../../utils/automaticLists";
import { CoverCollage } from "./ListPreview";
import SmartListRuleFields from "./SmartListRuleFields";
import {
  CandidateRow,
  ListMeta,
  ManualRankedList,
  SmartQuickControls,
  StaticRankedList,
} from "./CustomListView";

const viewOptions = [
  { value: "posters", label: "Posters", icon: Grid2X2 },
  { value: "rows", label: "Rows", icon: List },
];
const listViewStorageKey = "gaming-backlog:list-detail-view";

function draftFromList(list) {
  return {
    name: list?.name || "",
    description: list?.description || "",
    query: normalizeSmartQuery(list?.query || {}),
    sortKey: normalizeSmartSortKey(list?.sortKey || "score"),
  };
}

function draftKey(draft, isSmart) {
  return JSON.stringify({
    name: draft?.name || "",
    description: draft?.description || "",
    query: isSmart ? normalizeSmartQuery(draft?.query || {}) : null,
    sortKey: isSmart
      ? normalizeSmartSortKey(draft?.sortKey || "score")
      : null,
  });
}

export default function CustomListPage() {
  const { id } = useParams();
  const listId = Number(id);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { games: backlogGames, loading: backlogLoading } = useGames();
  const [list, setList] = useState(null);
  const [manualGames, setManualGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [isManagingManual, setIsManagingManual] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    query: {},
    sortKey: "score",
  });
  const [saving, setSaving] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [addedCount, setAddedCount] = useState(0);
  const [manageSaveStatus, setManageSaveStatus] = useState("idle");
  const [smartSaveStatus, setSmartSaveStatus] = useState("idle");
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "posters";
    return window.localStorage.getItem(listViewStorageKey) === "rows"
      ? "rows"
      : "posters";
  });
  const smartSaveSequence = useRef(0);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { statusGroupOf } = useStatusGroups();

  const isSmart = list?.listType === "smart";
  const resolvedSmart = useMemo(
    () =>
      isSmart
        ? resolveSmartList(list, backlogGames, { statusGroupOf })
        : null,
    [backlogGames, isSmart, list, statusGroupOf],
  );
  const displayGames = isSmart ? resolvedSmart?.games || [] : manualGames;
  const metadataDirty =
    showEdit &&
    draftKey(draft, isSmart) !== draftKey(draftFromList(list), isSmart);

  const loadList = React.useCallback(async () => {
    if (!isAuthenticated || !Number.isFinite(listId)) return;
    try {
      setLoading(true);
      setError("");
      const payload = await getUserList(listId);
      setList(payload?.list || null);
      setManualGames(Array.isArray(payload?.games) ? payload.games : []);
    } catch (err) {
      setError(err?.message || "Could not load list.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, listId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (list) {
      setDraft(draftFromList(list));
    }
  }, [list]);

  useEffect(() => {
    if (!metadataDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [metadataDirty]);

  useEffect(() => {
    window.localStorage.setItem(listViewStorageKey, viewMode);
  }, [viewMode]);

  const listGameIds = useMemo(
    () => new Set(manualGames.map((game) => Number(game.id))),
    [manualGames],
  );
  const candidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return backlogGames
      .filter((game) => !listGameIds.has(Number(game.id)))
      .filter((game) => {
        if (!q) return true;
        return String(game.name || "")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 50);
  }, [addSearch, backlogGames, listGameIds]);

  const saveMetadata = async (event) => {
    event?.preventDefault?.();
    if (!draft.name.trim()) return false;
    try {
      setSaving(true);
      const query = isSmart ? normalizeSmartQuery(draft.query) : null;
      const sortKey = isSmart ? normalizeSmartSortKey(draft.sortKey) : null;
      const payload = await updateUserList(listId, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        query,
        sortKey,
      });
      setList(payload?.list || list);
      setShowEdit(false);
      toast.success("List saved.");
      return true;
    } catch (err) {
      toast.error(err?.message || "Could not save list.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const requestCloseEdit = async () => {
    if (saving) return;
    if (!metadataDirty) {
      setShowEdit(false);
      setDraft(draftFromList(list));
      return;
    }
    const choice = await confirm({
      title: "Unsaved list changes",
      message: "Save your list details before closing?",
      confirmLabel: "Save changes",
      confirmValue: "save",
      secondaryLabel: "Discard changes",
      secondaryValue: "discard",
      cancelLabel: "Keep editing",
      tone: "primary",
    });
    if (choice === "save") {
      await saveMetadata();
    } else if (choice === "discard") {
      setDraft(draftFromList(list));
      setShowEdit(false);
    }
  };

  const deleteList = async () => {
    const ok = await confirm({
      title: "Delete this list?",
      message: "This removes the list. Your backlog games stay untouched.",
      confirmLabel: "Delete list",
    });
    if (!ok) return;
    try {
      await deleteUserList(listId);
      toast.success("List deleted.");
      navigate("/lists");
    } catch (err) {
      toast.error(err?.message || "Could not delete list.");
    }
  };

  const addGame = async (gameId) => {
    try {
      setAddingId(gameId);
      setManageSaveStatus("saving");
      const payload = await addGameToList(listId, gameId);
      setManualGames(Array.isArray(payload?.games) ? payload.games : []);
      setAddedCount((count) => count + 1);
      setManageSaveStatus("saved");
    } catch (err) {
      setManageSaveStatus("error");
      toast.error(err?.message || "Could not add game.");
    } finally {
      setAddingId(null);
    }
  };

  const removeGame = async (gameId) => {
    try {
      setManageSaveStatus("saving");
      const payload = await removeGameFromList(listId, gameId);
      setManualGames(Array.isArray(payload?.games) ? payload.games : []);
      setManageSaveStatus("saved");
    } catch (err) {
      setManageSaveStatus("error");
      toast.error(err?.message || "Could not remove game.");
    }
  };

  const reorder = async (orderedGames) => {
    const previous = manualGames;
    setManualGames(orderedGames);
    setManageSaveStatus("saving");
    try {
      const payload = await reorderListGames(listId, {
        gameIds: orderedGames.map((game) => Number(game.id)),
      });
      setManualGames(
        Array.isArray(payload?.games) ? payload.games : orderedGames,
      );
      setManageSaveStatus("saved");
    } catch (err) {
      setManualGames(previous);
      setManageSaveStatus("error");
      toast.error(err?.message || "Could not reorder list.");
    }
  };

  const updateSmartQuery = async (nextQuery) => {
    if (!isSmart || !list) return;
    const query = normalizeSmartQuery(nextQuery);
    const sortKey = normalizeSmartSortKey(list.sortKey || "score");
    const previous = list;
    const nextList = { ...list, query, sortKey };
    const sequence = smartSaveSequence.current + 1;
    smartSaveSequence.current = sequence;
    setList(nextList);
    setSmartSaveStatus("saving");
    try {
      const payload = await updateUserList(listId, {
        name: list.name,
        description: list.description || null,
        query,
        sortKey,
      });
      if (smartSaveSequence.current !== sequence) return;
      setList(payload?.list || nextList);
      setSmartSaveStatus("saved");
    } catch (err) {
      if (smartSaveSequence.current !== sequence) return;
      setList(previous);
      setSmartSaveStatus("error");
      toast.error(err?.message || "Could not update smart list.");
    }
  };

  const openEdit = () => {
    setDraft(draftFromList(list));
    setShowEdit(true);
  };

  const openAdd = () => {
    setAddedCount(0);
    setShowAdd(true);
  };

  const closeAdd = () => {
    setShowAdd(false);
    setAddSearch("");
    if (addedCount > 0) {
      toast.success(
        addedCount === 1
          ? "1 game added to the list."
          : `${addedCount} games added to the list.`,
      );
    }
    setAddedCount(0);
  };

  if (
    authLoading ||
    (isAuthenticated && (loading || (isSmart && backlogLoading)))
  ) {
    return (
      <AppPage width="full">
        <CustomListPageSkeleton viewMode={viewMode} />
      </AppPage>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppPage width="full">
        <EmptyState
          icon={LibraryBig}
          title="Sign in to view this list."
          description="Lists are private to your account."
          action={
            <Button as={Link} to="/" variant="primary">
              Back to backlog
            </Button>
          }
        />
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage width="full">
        <PageError
          title="Could not load this list."
          description={error}
          onRetry={loadList}
          retryLabel="Retry"
        />
      </AppPage>
    );
  }

  return (
    <AppPage width="full">
      <div className="space-y-5">
        <nav
          className="flex min-w-0 items-center gap-2 text-sm text-content-muted"
          aria-label="Breadcrumb"
        >
          <Link
            to="/lists"
            className="rounded-control px-1 py-0.5 transition-colors hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
          >
            Lists
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-content-secondary">
            {list?.name || "List"}
          </span>
        </nav>

        <header className="rounded-2xl border border-surface-border bg-surface-card p-4 shadow-panel sm:p-5">
          <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <CoverCollage
              games={displayGames}
              className="max-h-52 rounded-lg lg:sticky lg:top-4"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
                    {isSmart ? (
                      <Wand2 className="h-4 w-4" aria-hidden="true" />
                    ) : null}
                    {isSmart ? "Private smart list" : "Private ranked list"}
                  </div>
                  <h1
                    className="mt-1 truncate text-3xl font-semibold"
                    title={list?.name || "List"}
                  >
                    {list?.name || "List"}
                  </h1>
                  {list?.description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
                      {list.description}
                    </p>
                  ) : null}
                  <ListMeta
                    count={displayGames.length}
                    updatedAt={list?.updated_at}
                    isSmart={isSmart}
                    ruleLabel={resolvedSmart?.ruleLabel}
                    className="mt-3"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {!isManagingManual ? (
                    <>
                      {!isSmart ? (
                        <Button
                          type="button"
                          variant="primary"
                          onClick={openAdd}
                          disabled={backlogLoading}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          {backlogLoading ? "Loading backlog..." : "Add games"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={openEdit}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit details
                      </Button>
                      {!isSmart ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setManageSaveStatus("idle");
                            setIsManagingManual(true);
                          }}
                        >
                          Manage games/order
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setIsManagingManual(false)}
                      disabled={manageSaveStatus === "saving"}
                    >
                      Done
                    </Button>
                  )}
                  <ActionMenu
                    label="More"
                    ariaLabel="More list actions"
                    className="[&>span]:hidden sm:[&>span]:inline"
                  >
                    {({ close }) => (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          close();
                          deleteList();
                        }}
                        disabled={manageSaveStatus === "saving" || saving}
                        className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-state-error transition-colors hover:bg-state-error/10 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete list
                      </button>
                    )}
                  </ActionMenu>
                </div>
              </div>
            </div>
          </div>
        </header>

        {isManagingManual ? (
          <section className="flex flex-col gap-3 rounded-panel border border-primary/25 bg-primary/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-content-primary">
                Manage games and ranking
              </div>
              <div className="mt-1 text-xs leading-5 text-content-muted">
                Add, remove, or drag games. Changes save automatically.
                <SaveStatus status={manageSaveStatus} />
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={openAdd}
              disabled={backlogLoading || manageSaveStatus === "saving"}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {backlogLoading ? "Loading backlog..." : "Add games"}
            </Button>
          </section>
        ) : null}

        <section className="flex flex-wrap items-center justify-between gap-3">
          {isSmart ? (
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <SmartQuickControls
                games={backlogGames}
                query={list?.query || {}}
                onChange={updateSmartQuery}
              />
              <SaveStatus status={smartSaveStatus} />
            </div>
          ) : (
            <div />
          )}
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            options={viewOptions}
            ariaLabel="List view"
            variant="view"
            className="h-10 border-surface-border/75 bg-surface-card/45"
            itemClassName="h-8 px-3 text-xs"
          />
        </section>

        {displayGames.length ? (
          isSmart ? (
            <StaticRankedList
              games={displayGames}
              viewMode={viewMode}
              onSelectGame={setSelectedGame}
            />
          ) : (
            <ManualRankedList
              games={manualGames}
              viewMode={viewMode}
              editable={isManagingManual}
              disabled={manageSaveStatus === "saving"}
              onSelectGame={setSelectedGame}
              onRemoveGame={removeGame}
              onReorder={reorder}
            />
          )
        ) : (
          <EmptyState
            icon={isSmart ? Wand2 : ListPlus}
            title={isSmart ? resolvedSmart?.emptyTitle : "This list is empty."}
            description={
              isSmart
                ? resolvedSmart?.emptyDescription
                : "Add games from your backlog, then drag them into the order you want."
            }
            action={
              !isSmart ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={openAdd}
                  disabled={backlogLoading}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {backlogLoading ? "Loading backlog..." : "Add games"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openEdit}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit details
                </Button>
              )
            }
          />
        )}
      </div>

      {showEdit ? (
        <Modal
          title="Edit list details"
          description={
            isSmart
              ? "Update the list identity and the rules that build it."
              : "Update the list name and description. Game membership and ranking are managed separately."
          }
          onClose={() => void requestCloseEdit()}
          closeDisabled={saving}
          size={isSmart ? "xl" : "md"}
        >
          <form onSubmit={saveMetadata} className="space-y-4">
            <Field id="custom-list-name" label="Name">
              <TextInput
                id="custom-list-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                maxLength={120}
                autoFocus
                disabled={saving}
              />
            </Field>
            <Field
              id="custom-list-description"
              label="Description"
              help="Optional. Only you can see this list."
            >
              <Textarea
                id="custom-list-description"
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                maxLength={1000}
                disabled={saving}
              />
            </Field>
            {isSmart ? (
              <>
                <SmartListRuleFields
                  games={backlogGames}
                  query={draft.query}
                  sortKey={draft.sortKey}
                  onQueryChange={(query) =>
                    setDraft((current) => ({ ...current, query }))
                  }
                  onSortChange={(sortKey) =>
                    setDraft((current) => ({ ...current, sortKey }))
                  }
                  disabled={saving}
                />
                <p className="rounded-lg border border-surface-border bg-surface-bg/40 px-3 py-2 text-xs leading-5 text-content-muted">
                  {describeSmartQuery(draft.query, draft.sortKey)}
                </p>
              </>
            ) : null}
            <div className="flex flex-col gap-3 border-t border-surface-border/65 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-content-muted">
                {metadataDirty ? "Unsaved changes" : "No changes yet"}
              </span>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void requestCloseEdit()}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving || !metadataDirty || !draft.name.trim()}
                >
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}

      {showAdd && !isSmart ? (
        <Modal
          title="Add games"
          description="Games are added immediately. You can keep choosing more before closing."
          onClose={closeAdd}
          closeDisabled={addingId != null}
          size="lg"
        >
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
              <TextInput
                value={addSearch}
                onChange={(event) => setAddSearch(event.target.value)}
                placeholder="Search your backlog"
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
              {candidates.length ? (
                candidates.map((game) => (
                  <CandidateRow
                    key={game.id}
                    game={game}
                    adding={addingId === game.id}
                    disabled={addingId != null}
                    onAdd={() => addGame(game.id)}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-surface-border bg-surface-bg/40 p-4 text-sm text-content-muted">
                  {addSearch.trim()
                    ? "No matching backlog games."
                    : "No backlog games available to add."}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-surface-border/65 pt-4">
              <span className="text-xs text-content-muted">
                {addedCount
                  ? `${addedCount} ${addedCount === 1 ? "game" : "games"} added`
                  : "Changes save automatically"}
              </span>
              <Button type="button" variant="secondary" onClick={closeAdd}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {selectedGame ? (
        <GameModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      ) : null}
    </AppPage>
  );
}

function SaveStatus({ status }) {
  if (!status || status === "idle") return null;
  const labels = {
    saving: "Saving...",
    saved: "Saved",
    error: "Save failed",
  };
  return (
    <span
      className={[
        "ml-2 inline-flex font-semibold",
        status === "error" ? "text-state-error" : "text-content-secondary",
      ].join(" ")}
      role={status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {labels[status]}
    </span>
  );
}

function CustomListPageSkeleton({ viewMode }) {
  return (
    <div
      className="space-y-5"
      role="status"
      aria-label="Loading list"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-44" />
      <div className="grid gap-5 rounded-2xl border border-surface-border bg-surface-card p-4 sm:p-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <div className="space-y-4 py-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-72" />
          <div className="flex flex-wrap gap-2 pt-2">
            <Skeleton className="h-10 w-28 rounded-control" />
            <Skeleton className="h-10 w-32 rounded-control" />
            <Skeleton className="h-10 w-40 rounded-control" />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-44 rounded-control" />
      </div>
      {viewMode === "rows" ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-md" />
              <Skeleton className="mx-auto h-4 w-8" />
              <Skeleton className="mx-auto h-3 w-3/4" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
