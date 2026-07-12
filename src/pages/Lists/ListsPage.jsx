import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  LibraryBig,
  ListOrdered,
  ListPlus,
  LockKeyhole,
  RefreshCw,
  Wand2,
} from "lucide-react";
import {
  Button,
  EmptyState,
  Field,
  Modal,
  SelectMenu,
  Textarea,
  TextInput,
  useToast,
} from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import { useGames } from "../../hooks/useGames";
import { createUserList, listUserLists } from "../../services/listService";
import {
  SMART_LIST_TEMPLATES,
  buildSmartQueryFromTemplate,
  describeSmartQuery,
  normalizeSmartQuery,
  normalizeSmartSortKey,
  resolveSmartList,
} from "../../utils/automaticLists";
import {
  AppPage,
  PageHeader,
  PageLoading,
  PageSection,
} from "../../components/layout";
import { CoverCollage, formatUpdatedDate } from "./ListPreview";
import SmartListRuleFields from "./SmartListRuleFields";

const defaultManualDraft = {
  mode: "manual",
  templateKey: "best-finished-year",
  name: "",
  description: "",
  query: {},
  sortKey: "score",
};

export default function ListsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    games,
    loading: gamesLoading,
    error: gamesError,
    refresh,
  } = useGames();
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(defaultManualDraft);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const { statusGroupOf } = useStatusGroups();

  const loadLists = React.useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setListsLoading(true);
      setListsError("");
      const payload = await listUserLists();
      setLists(Array.isArray(payload?.lists) ? payload.lists : []);
    } catch (err) {
      setListsError(err?.message || "Could not load lists.");
    } finally {
      setListsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const displayLists = useMemo(
    () =>
      lists.map((list) => {
        if (list.listType !== "smart") return list;
        const resolved = resolveSmartList(list, games, { statusGroupOf });
        return {
          ...list,
          gameCount: resolved.games.length,
          previewGames: resolved.games.slice(0, 4),
          description: list.description || resolved.ruleLabel,
        };
      }),
    [games, lists, statusGroupOf],
  );

  const applyTemplate = (templateKey) => {
    const preset = buildSmartQueryFromTemplate(templateKey, games);
    setDraft((current) => ({
      ...current,
      templateKey,
      name: preset.name,
      description: preset.description,
      query: preset.query,
      sortKey: preset.sortKey,
    }));
  };

  const setMode = (mode) => {
    if (mode === "smart") {
      const preset = buildSmartQueryFromTemplate(draft.templateKey, games);
      setDraft({
        mode,
        templateKey: draft.templateKey,
        name: draft.name || preset.name,
        description: draft.description || preset.description,
        query: preset.query,
        sortKey: preset.sortKey,
      });
      return;
    }
    setDraft((current) => ({ ...current, mode: "manual" }));
  };

  const closeCreate = () => {
    setShowCreate(false);
    setDraft(defaultManualDraft);
  };

  const createList = async (event) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    try {
      setCreating(true);
      const isSmart = draft.mode === "smart";
      const query = isSmart ? normalizeSmartQuery(draft.query) : null;
      const sortKey = isSmart ? normalizeSmartSortKey(draft.sortKey) : null;
      const payload = await createUserList({
        name,
        description: draft.description.trim() || null,
        listType: isSmart ? "smart" : "manual",
        query,
        sortKey,
      });
      toast.success(isSmart ? "Smart list created." : "Ranked list created.");
      closeCreate();
      const id = payload?.list?.id;
      if (id) navigate(`/lists/${id}`);
      else loadLists();
    } catch (err) {
      toast.error(err?.message || "Could not create list.");
    } finally {
      setCreating(false);
    }
  };

  if (!isAuthenticated && !authLoading) {
    return (
      <AppPage width="wide">
        <PageHeader
          title="Lists"
          description="Organize games into ranked collections and smart lists."
          icon={ListOrdered}
        />
        <div className="pt-6">
          <EmptyState
            icon={LockKeyhole}
            title="Sign in to use Lists."
            description="Lists are private rankings and smart collections built from your backlog."
            action={
              <Button as={Link} to="/" variant="primary">
                <LibraryBig className="h-4 w-4" aria-hidden="true" />
                Go to backlog
              </Button>
            }
          />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage width="wide">
      <PageHeader
        title="Lists"
        description="Organize games into ranked collections and smart lists that update automatically."
        icon={ListOrdered}
        meta={displayLists.length ? `${displayLists.length} saved` : undefined}
        actions={
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowCreate(true)}
          >
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            Create list
          </Button>
        }
      />

      <div className="pt-7">
        <PageSection title="Saved lists">
          {authLoading || gamesLoading ? (
            <PageLoading
              rows={4}
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            />
          ) : gamesError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Could not load your backlog."
              description={
                gamesError?.message || "Lists need your games to load first."
              }
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => refresh()}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </Button>
              }
            />
          ) : listsError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Could not load lists."
              description={listsError}
              action={
                <Button type="button" variant="primary" onClick={loadLists}>
                  Try again
                </Button>
              }
            />
          ) : displayLists.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {displayLists.map((list) => (
                <ListCard key={list.id} list={list} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ListPlus}
              title={listsLoading ? "Loading lists..." : "No lists yet."}
              description="Create a ranked list for your own order, or a smart list that updates from rules you choose."
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setShowCreate(true)}
                >
                  <ListPlus className="h-4 w-4" aria-hidden="true" />
                  Create list
                </Button>
              }
            />
          )}
        </PageSection>
      </div>

      {showCreate ? (
        <Modal
          title={
            draft.mode === "smart" ? "Create smart list" : "Create ranked list"
          }
          onClose={closeCreate}
          size="xl"
        >
          <form onSubmit={createList} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                icon={ListOrdered}
                title="Ranked list"
                description="You choose the games and drag them into order."
                active={draft.mode === "manual"}
                onClick={() => setMode("manual")}
              />
              <ModeCard
                icon={Wand2}
                title="Smart list"
                description="You choose rules, and the list updates from your backlog."
                active={draft.mode === "smart"}
                onClick={() => setMode("smart")}
              />
            </div>

            {draft.mode === "smart" ? (
              <Field id="smart-template" label="Start from">
                <SelectMenu
                  id="smart-template"
                  value={draft.templateKey}
                  onChange={applyTemplate}
                  options={SMART_LIST_TEMPLATES.map((template) => ({
                    value: template.key,
                    label: template.name,
                  }))}
                  disabled={creating}
                />
              </Field>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field id="list-name" label="Name">
                <TextInput
                  id="list-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  maxLength={120}
                  autoFocus
                  disabled={creating}
                />
              </Field>
              <Field
                id="list-description"
                label="Description"
                help="Optional. Private in V1."
              >
                <Textarea
                  id="list-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  maxLength={1000}
                  disabled={creating}
                />
              </Field>
            </div>

            {draft.mode === "smart" ? (
              <>
                <SmartListRuleFields
                  games={games}
                  query={draft.query}
                  sortKey={draft.sortKey}
                  onQueryChange={(query) =>
                    setDraft((current) => ({ ...current, query }))
                  }
                  onSortChange={(sortKey) =>
                    setDraft((current) => ({ ...current, sortKey }))
                  }
                  disabled={creating}
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
                onClick={closeCreate}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={creating || !draft.name.trim()}
              >
                {creating ? "Creating..." : "Create list"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </AppPage>
  );
}

function ModeCard({ icon: Icon, title, description, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex min-w-0 items-start gap-3 rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-primary/60 bg-primary/10 text-content-primary"
          : "border-surface-border bg-surface-bg/35 text-content-secondary hover:border-primary/35 hover:bg-surface-elevated/40",
      ].join(" ")}
    >
      <Icon
        className="mt-0.5 h-5 w-5 shrink-0 text-primary-light"
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-content-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

function ListCard({ list }) {
  const isSmart = list.listType === "smart";
  return (
    <Link
      to={`/lists/${list.id}`}
      className="group block min-w-0 rounded-lg border border-surface-border bg-surface-card p-3 transition-colors hover:border-primary/45 hover:bg-surface-elevated/35"
    >
      <CoverCollage
        games={list.previewGames}
        className="transition-colors group-hover:border-primary/35"
      />
      <div className="mt-3 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-content-primary">
            {list.name}
          </h3>
          <span className="shrink-0 rounded-full border border-surface-border bg-surface-bg/50 px-2 py-1 text-xs text-content-muted">
            {isSmart ? "Smart" : "Ranked"}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-content-muted">
          {list.description ||
            (list.updated_at
              ? `Updated ${formatUpdatedDate(list.updated_at)}`
              : "Private list")}
        </p>
      </div>
      <div className="mt-3 text-sm font-semibold text-content-secondary">
        {list.gameCount} {list.gameCount === 1 ? "game" : "games"}
      </div>
    </Link>
  );
}
