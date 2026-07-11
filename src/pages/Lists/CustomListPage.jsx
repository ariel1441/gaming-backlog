import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  GripVertical,
  Grid2X2,
  LibraryBig,
  List,
  ListPlus,
  Pencil,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import GameModal from "../../components/GameModal";
import { AppPage, PageError, PageLoading } from "../../components/layout";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SelectMenu,
  Textarea,
  TextInput,
  useConfirm,
  useToast,
} from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
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
  SMART_STATUS_OPTIONS,
  describeSmartQuery,
  normalizeSmartQuery,
  normalizeSmartSortKey,
  resolveSmartList,
  smartListExposedControls,
  smartListGenres,
  smartListYears,
} from "../../utils/automaticLists";
import { hoursValueForList } from "../../utils/hours";
import { splitCsv } from "../../utils/gameList";
import { CoverCollage, formatUpdatedDate } from "./ListPreview";
import SmartListRuleFields from "./SmartListRuleFields";
import {
  CandidateRow,
  ListMeta,
  ManualRankedList,
  SmartQuickControls,
  StaticRankedList,
} from "./CustomListView";

const viewOptions = [
  { value: "posters", label: "Posters" },
  { value: "rows", label: "Rows" },
];

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
  const [isEditingManual, setIsEditingManual] = useState(false);
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
  const [viewMode, setViewMode] = useState("posters");
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const isSmart = list?.listType === "smart";
  const resolvedSmart = useMemo(
    () => (isSmart ? resolveSmartList(list, backlogGames) : null),
    [backlogGames, isSmart, list],
  );
  const displayGames = isSmart ? resolvedSmart?.games || [] : manualGames;

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
      setDraft({
        name: list.name || "",
        description: list.description || "",
        query: normalizeSmartQuery(list.query || {}),
        sortKey: normalizeSmartSortKey(list.sortKey || "score"),
      });
    }
  }, [list]);

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
    if (!draft.name.trim()) return;
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
      setIsEditingManual(false);
      toast.success("List saved.");
    } catch (err) {
      toast.error(err?.message || "Could not save list.");
    } finally {
      setSaving(false);
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
      const payload = await addGameToList(listId, gameId);
      setManualGames(Array.isArray(payload?.games) ? payload.games : []);
      toast.success("Game added.");
    } catch (err) {
      toast.error(err?.message || "Could not add game.");
    } finally {
      setAddingId(null);
    }
  };

  const removeGame = async (gameId) => {
    try {
      const payload = await removeGameFromList(listId, gameId);
      setManualGames(Array.isArray(payload?.games) ? payload.games : []);
      toast.success("Game removed.");
    } catch (err) {
      toast.error(err?.message || "Could not remove game.");
    }
  };

  const reorder = async (orderedGames) => {
    const previous = manualGames;
    setManualGames(orderedGames);
    try {
      const payload = await reorderListGames(listId, {
        gameIds: orderedGames.map((game) => Number(game.id)),
      });
      setManualGames(
        Array.isArray(payload?.games) ? payload.games : orderedGames,
      );
    } catch (err) {
      setManualGames(previous);
      toast.error(err?.message || "Could not reorder list.");
    }
  };

  const updateSmartQuery = async (nextQuery) => {
    if (!isSmart || !list) return;
    const query = normalizeSmartQuery(nextQuery);
    const sortKey = normalizeSmartSortKey(list.sortKey || "score");
    const previous = list;
    const nextList = { ...list, query, sortKey };
    setList(nextList);
    try {
      const payload = await updateUserList(listId, {
        name: list.name,
        description: list.description || null,
        query,
        sortKey,
      });
      setList(payload?.list || nextList);
    } catch (err) {
      setList(previous);
      toast.error(err?.message || "Could not update smart list.");
    }
  };

  const startEdit = () => {
    if (isSmart) {
      setShowEdit(true);
      return;
    }
    setIsEditingManual(true);
  };

  const cancelManualEdit = () => {
    setDraft({
      name: list?.name || "",
      description: list?.description || "",
      query: normalizeSmartQuery(list?.query || {}),
      sortKey: normalizeSmartSortKey(list?.sortKey || "score"),
    });
    setIsEditingManual(false);
  };

  if (authLoading || (isAuthenticated && (loading || backlogLoading))) {
    return (
      <AppPage width="full">
        <PageLoading rows={5} />
      </AppPage>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppPage width="full">
        <EmptyState
          icon={LibraryBig}
          title="Sign in to view this list."
          description="Lists are private owner-only collections."
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
                  {isEditingManual ? (
                    <div className="mt-2 max-w-3xl space-y-2">
                      <TextInput
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        maxLength={120}
                        className="text-xl font-semibold sm:text-2xl"
                        aria-label="List name"
                      />
                      <TextInput
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        maxLength={1000}
                        placeholder="Description"
                        aria-label="List description"
                      />
                      <ListMeta
                        count={displayGames.length}
                        updatedAt={list?.updated_at}
                        isSmart={isSmart}
                        ruleLabel={resolvedSmart?.ruleLabel}
                      />
                    </div>
                  ) : (
                    <h1 className="mt-1 truncate text-3xl font-semibold">
                      {list?.name || "List"}
                    </h1>
                  )}
                  {!isEditingManual && list?.description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
                      {list.description}
                    </p>
                  ) : null}
                  {!isEditingManual ? (
                    <ListMeta
                      count={displayGames.length}
                      updatedAt={list?.updated_at}
                      isSmart={isSmart}
                      ruleLabel={resolvedSmart?.ruleLabel}
                      className="mt-3"
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button as={Link} to="/lists" variant="secondary">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Lists
                  </Button>
                  {isEditingManual ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={cancelManualEdit}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={saveMetadata}
                        disabled={saving || !draft.name.trim()}
                      >
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={startEdit}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </Button>
                  )}
                  {!isSmart && isEditingManual ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setShowAdd(true)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add games
                    </Button>
                  ) : null}
                  <IconButton
                    icon={Trash2}
                    label="Delete list"
                    title="Delete list"
                    variant="danger"
                    onClick={deleteList}
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-3">
          {isSmart || isEditingManual ? (
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {!isSmart ? (
                <div className="text-sm text-content-muted">
                  Drag items to change the ranking.
                </div>
              ) : null}
              {isSmart ? (
                <SmartQuickControls
                  games={backlogGames}
                  query={list?.query || {}}
                  onChange={updateSmartQuery}
                />
              ) : null}
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {viewMode === "posters" ? (
              <Grid2X2
                className="h-4 w-4 text-content-muted"
                aria-hidden="true"
              />
            ) : (
              <List className="h-4 w-4 text-content-muted" aria-hidden="true" />
            )}
            <SelectMenu
              value={viewMode}
              onChange={setViewMode}
              options={viewOptions}
              className="w-40"
            />
          </div>
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
              editable={isEditingManual}
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
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add games
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowEdit(true)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit rules
                </Button>
              )
            }
          />
        )}
      </div>

      {showEdit ? (
        <Modal
          title={isSmart ? "Edit smart list" : "Edit ranked list"}
          onClose={() => setShowEdit(false)}
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
              help="Optional. Private in V1."
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowEdit(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={saving || !draft.name.trim()}
              >
                {saving ? "Saving..." : "Save list"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showAdd && !isSmart ? (
        <Modal title="Add games" onClose={() => setShowAdd(false)} size="lg">
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
          </div>
        </Modal>
      ) : null}

      {selectedGame ? (
        <GameModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      ) : null}
    </AppPage>
  );
}
