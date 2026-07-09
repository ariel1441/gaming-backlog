import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
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
  RefreshCw,
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
import GameModal from "../../components/GameModal";
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

function moveItem(array, fromIndex, toIndex) {
  const next = [...array];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function gameCover(game) {
  return game?.cover || game?.cover_url || game?.catalog_cover_url || game?.rawg_cover || "";
}

function gameTitle(game) {
  return game?.displayName || game?.name || "Untitled game";
}

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
    [backlogGames, isSmart, list]
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
    [manualGames]
  );
  const candidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return backlogGames
      .filter((game) => !listGameIds.has(Number(game.id)))
      .filter((game) => {
        if (!q) return true;
        return String(game.name || "").toLowerCase().includes(q);
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
      setManualGames(Array.isArray(payload?.games) ? payload.games : orderedGames);
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
      <main className="flex min-h-screen items-center justify-center bg-surface-bg text-content-primary">
        <div className="h-12 w-12 animate-spin rounded-full border-t-4 border-primary" />
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <EmptyState
          icon={LibraryBig}
          title="Sign in to view this list."
          description="Lists are private owner-only collections."
          action={<Button as={Link} to="/" variant="primary">Back to backlog</Button>}
        />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load this list."
          description={error}
          action={
            <Button type="button" variant="primary" onClick={loadList}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-bg px-3 py-4 text-content-primary sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
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
                    {isSmart ? <Wand2 className="h-4 w-4" aria-hidden="true" /> : null}
                    {isSmart ? "Private smart list" : "Private ranked list"}
                  </div>
                  {isEditingManual ? (
                    <div className="mt-2 max-w-3xl space-y-2">
                      <TextInput
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        maxLength={120}
                        className="text-xl font-semibold sm:text-2xl"
                        aria-label="List name"
                      />
                      <TextInput
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, description: event.target.value }))
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
                    <Button type="button" variant="secondary" onClick={startEdit}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </Button>
                  )}
                  {!isSmart && isEditingManual ? (
                    <Button type="button" variant="primary" onClick={() => setShowAdd(true)}>
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
              <div className="text-sm text-content-muted">
                {isSmart
                  ? "Smart membership updates from your backlog."
                  : "Drag items to change the ranking."}
              </div>
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
              <Grid2X2 className="h-4 w-4 text-content-muted" aria-hidden="true" />
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
                <Button type="button" variant="primary" onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add games
                </Button>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setShowEdit(true)}>
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
          maxWidth={isSmart ? "max-w-3xl" : "max-w-xl"}
        >
          <form onSubmit={saveMetadata} className="space-y-4">
            <Field id="custom-list-name" label="Name">
              <TextInput
                id="custom-list-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                maxLength={120}
                autoFocus
                disabled={saving}
              />
            </Field>
            <Field id="custom-list-description" label="Description" help="Optional. Private in V1.">
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
                  onQueryChange={(query) => setDraft((current) => ({ ...current, query }))}
                  onSortChange={(sortKey) => setDraft((current) => ({ ...current, sortKey }))}
                  disabled={saving}
                />
                <p className="rounded-lg border border-surface-border bg-surface-bg/40 px-3 py-2 text-xs leading-5 text-content-muted">
                  {describeSmartQuery(draft.query, draft.sortKey)}
                </p>
              </>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowEdit(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving || !draft.name.trim()}>
                {saving ? "Saving..." : "Save list"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showAdd && !isSmart ? (
        <Modal title="Add games" onClose={() => setShowAdd(false)} maxWidth="max-w-2xl">
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
    </main>
  );
}

function controlOptionsWithCurrent(options, currentValue) {
  const current = currentValue == null || currentValue === "" ? "" : String(currentValue);
  if (!current || options.some((option) => option.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

function SmartQuickControls({ games, query, onChange }) {
  const controls = smartListExposedControls(query);
  if (!controls.length) return null;

  const finishedYearOptions = controlOptionsWithCurrent(
    smartListYears(games).map((year) => ({ value: String(year), label: String(year) })),
    query.finishedYear
  );
  const releaseYearOptions = controlOptionsWithCurrent(
    smartListYears(games, "release").map((year) => ({ value: String(year), label: String(year) })),
    query.releasedYear
  );
  const genreOptions = controlOptionsWithCurrent(
    smartListGenres(games).map((genre) => ({ value: genre.value, label: genre.value })),
    query.genre
  );
  const maxHoursOptions = controlOptionsWithCurrent(
    [5, 10, 15, 20, 30, 50].map((value) => ({ value: String(value), label: `${value}h` })),
    query.maxHours
  );
  const update = (patch) => onChange?.({ ...query, ...patch });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {controls.includes("status") ? (
        <LabeledQuickSelect
          label="Status"
          value={query.status || ""}
          options={SMART_STATUS_OPTIONS.map((option) => ({
            value: option.value,
            label: option.value ? option.label : "Any",
          }))}
          onChange={(value) => update({ status: value || null })}
        />
      ) : null}
      {controls.includes("finishedYear") ? (
        <LabeledQuickSelect
          label="Year"
          value={query.finishedYear ? String(query.finishedYear) : ""}
          options={finishedYearOptions}
          onChange={(value) => update({ finishedYear: Number(value) })}
        />
      ) : null}
      {controls.includes("releasedYear") ? (
        <LabeledQuickSelect
          label="Release"
          value={query.releasedYear ? String(query.releasedYear) : ""}
          options={releaseYearOptions}
          onChange={(value) => update({ releasedYear: Number(value) })}
        />
      ) : null}
      {controls.includes("genre") ? (
        <LabeledQuickSelect
          label="Genre"
          value={query.genre || ""}
          options={genreOptions}
          onChange={(value) => update({ genre: value })}
        />
      ) : null}
      {controls.includes("maxHours") ? (
        <LabeledQuickSelect
          label="Max"
          value={query.maxHours == null ? "" : String(query.maxHours)}
          options={maxHoursOptions}
          onChange={(value) => update({ maxHours: Number(value) })}
        />
      ) : null}
    </div>
  );
}

function LabeledQuickSelect({ label, value, options, onChange }) {
  return (
    <div className="grid grid-cols-[auto_minmax(6rem,1fr)] items-center gap-2 rounded-lg border border-surface-border bg-surface-card/75 px-2 py-1">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-content-muted">
        {label}
      </span>
      <SelectMenu
        value={value}
        onChange={onChange}
        options={options}
        className="min-w-28"
        buttonClassName="min-h-8 rounded-lg border-0 bg-surface-bg/70 px-2 py-1 text-xs shadow-none"
      />
    </div>
  );
}

function ListMeta({ count, updatedAt, isSmart, ruleLabel, className = "" }) {
  return (
    <div className={["max-w-3xl text-sm leading-6 text-content-muted", className].join(" ")}>
      {count} {count === 1 ? "game" : "games"}
      {updatedAt ? ` - Updated ${formatUpdatedDate(updatedAt)}` : ""}
      {isSmart ? (
        <span className="block">{ruleLabel}</span>
      ) : (
        <span className="block">Ranked by you.</span>
      )}
    </div>
  );
}

function ManualRankedList({ games, viewMode, editable, onSelectGame, onRemoveGame, onReorder }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const fromIndex = games.findIndex((game) => String(game.id) === String(active.id));
    const toIndex = games.findIndex((game) => String(game.id) === String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(moveItem(games, fromIndex, toIndex));
  };

  if (!editable) {
    return <StaticRankedList games={games} viewMode={viewMode} onSelectGame={onSelectGame} />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext
        items={games.map((game) => String(game.id))}
        strategy={viewMode === "rows" ? verticalListSortingStrategy : rectSortingStrategy}
      >
        {viewMode === "rows" ? (
          <div className="space-y-2">
            {games.map((game, index) => (
              <SortableRankedRow
                key={game.id}
                game={game}
                index={index}
                isDragging={activeId === String(game.id)}
                onSelect={() => onSelectGame(game)}
                onRemove={() => onRemoveGame(game.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-x-4 gap-y-7 [grid-template-columns:repeat(auto-fill,minmax(112px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(128px,1fr))] lg:[grid-template-columns:repeat(auto-fill,minmax(142px,1fr))]">
            {games.map((game, index) => (
              <SortablePosterCard
                key={game.id}
                game={game}
                index={index}
                isDragging={activeId === String(game.id)}
                onSelect={() => onSelectGame(game)}
                onRemove={() => onRemoveGame(game.id)}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </DndContext>
  );
}

function StaticRankedList({ games, viewMode, onSelectGame }) {
  if (viewMode === "rows") {
    return (
      <div className="space-y-2">
        {games.map((game, index) => (
          <RankedRow
            key={game.id}
            game={game}
            index={index}
            onSelect={() => onSelectGame(game)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-x-4 gap-y-7 [grid-template-columns:repeat(auto-fill,minmax(112px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(128px,1fr))] lg:[grid-template-columns:repeat(auto-fill,minmax(142px,1fr))]">
      {games.map((game, index) => (
        <PosterCard
          key={game.id}
          game={game}
          index={index}
          onSelect={() => onSelectGame(game)}
        />
      ))}
    </div>
  );
}

function SortablePosterCard({ game, index, isDragging, onSelect, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: String(game.id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative min-w-0">
      <button
        type="button"
        className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-bg/85 text-content-muted shadow-panel hover:text-content-primary"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <PosterCard game={game} index={index} onSelect={onSelect} />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-bg/85 text-content-muted opacity-100 shadow-panel hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
        title="Remove from list"
        aria-label={`Remove ${gameTitle(game)} from list`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function PosterCard({ game, index, onSelect }) {
  const cover = gameCover(game);
  const title = gameTitle(game);
  return (
    <button type="button" onClick={onSelect} className="block w-full min-w-0 text-left">
      <div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-surface-card shadow-panel ring-1 ring-surface-border transition-colors hover:ring-primary/45">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-elevated/70 px-3 text-center text-3xl font-semibold text-content-muted">
            {String(title || "?").charAt(0)}
          </div>
        )}
      </div>
      <div className="mt-1.5 text-center text-sm font-semibold text-content-primary">
        {index + 1}
      </div>
      <div className="mt-1 truncate text-center text-xs text-content-muted">
        {title}
      </div>
    </button>
  );
}

function SortableRankedRow({ game, index, isDragging, onSelect, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: String(game.id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <RankedRow
        game={game}
        index={index}
        onSelect={onSelect}
        dragHandle={
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-content-muted hover:bg-surface-elevated hover:text-content-primary"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
        }
        trailing={
          <IconButton
            icon={X}
            label={`Remove ${gameTitle(game)} from list`}
            title="Remove"
            variant="ghost"
            onClick={onRemove}
          />
        }
      />
    </div>
  );
}

function yearFromDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? String(date.getFullYear()) : "";
}

function compactDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function scoreLabel(game) {
  const score = Number(game?.my_score);
  return Number.isFinite(score) && score > 0 ? `${score}/10` : "";
}

function hoursLabel(game) {
  const hours = Number(hoursValueForList(game));
  if (!Number.isFinite(hours) || hours <= 0) return "";
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function rowGenres(game) {
  return [...splitCsv(game?.my_genre), ...splitCsv(game?.genres)].slice(0, 3);
}

function MetaPill({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-surface-border bg-surface-bg/55 px-2.5 py-1 text-xs font-medium text-content-secondary">
      <Icon className="h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function RankedRow({ game, index, onSelect, dragHandle = null, trailing = null }) {
  const cover = gameCover(game);
  const title = gameTitle(game);
  const releaseYear = yearFromDate(game?.releaseDate || game?.released || game?.released_at);
  const finishedDate = compactDate(game?.finished_at);
  const startedDate = compactDate(game?.started_at);
  const genres = rowGenres(game);

  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-surface-border/80 py-4">
      {dragHandle}
      <div className="w-10 shrink-0 text-right text-xl font-semibold text-content-primary sm:w-12">
        {index + 1}.
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-md p-1 text-left hover:bg-surface-elevated/55"
      >
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-24 w-16 shrink-0 rounded object-cover ring-1 ring-surface-border" />
        ) : (
          <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-surface-elevated/70 text-xl font-semibold text-content-muted ring-1 ring-surface-border">
            {String(title || "?").charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="min-w-0 max-w-full truncate text-lg font-semibold text-content-primary">
              {title}
            </div>
            {releaseYear ? (
              <span className="shrink-0 text-sm text-content-muted">{releaseYear}</span>
            ) : null}
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap gap-2">
            <MetaPill icon={Star}>{scoreLabel(game)}</MetaPill>
            <MetaPill icon={Clock3}>{hoursLabel(game)}</MetaPill>
            <MetaPill icon={Tag}>{game.status}</MetaPill>
            <MetaPill icon={CalendarDays}>
              {finishedDate ? `Finished ${finishedDate}` : startedDate ? `Started ${startedDate}` : ""}
            </MetaPill>
          </div>
          {genres.length ? (
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              {genres.map((genre) => (
                <span
                  key={genre}
                  className="max-w-full truncate rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-content-secondary"
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : null}
          </div>
      </button>
      {trailing}
    </div>
  );
}

function CandidateRow({ game, adding, disabled, onAdd }) {
  const cover = gameCover(game);
  const title = gameTitle(game);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-surface-border bg-surface-bg/35 p-2">
      {cover ? (
        <img src={cover} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-surface-elevated text-xs font-semibold text-content-muted">
          {String(title || "?").charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-content-primary">
          {title}
        </div>
        <div className="mt-1 truncate text-xs text-content-muted">
          {game.status || "No status"}
        </div>
      </div>
      <Button type="button" variant="secondary" onClick={onAdd} disabled={disabled}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {adding ? "Adding..." : "Add"}
      </Button>
    </div>
  );
}
