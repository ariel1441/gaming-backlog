import { useMemo, useState } from "react";
import { Tags } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  SelectMenu,
  Skeleton,
  TextInput,
  useConfirm,
  useToast,
} from "../../components/ui";
import { usePersonalGenres } from "../../hooks/usePersonalGenres";
import {
  createPersonalGenre,
  deletePersonalGenre,
  mergePersonalGenre,
  renamePersonalGenre,
} from "../../services/personalGenreService";

export function PersonalGenreSettings({ refreshGames }) {
  const { genres, loading, error, refresh } = usePersonalGenres(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [mergeTargets, setMergeTargets] = useState({});
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const options = useMemo(
    () => genres.map((genre) => ({ value: String(genre.id), label: genre.name })),
    [genres],
  );

  const reloadAll = async () => {
    await Promise.all([refresh(), refreshGames?.()]);
  };

  const addGenre = async (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      setBusyId("new");
      await createPersonalGenre(name);
      setNewName("");
      await refresh();
      toast.success("Personal genre saved.");
    } catch (nextError) {
      toast.error(nextError.message || "Could not save that genre.");
    } finally {
      setBusyId(null);
    }
  };

  const saveRename = async (genre) => {
    try {
      setBusyId(genre.id);
      await renamePersonalGenre(genre.id, editingName);
      setEditingId(null);
      await reloadAll();
      toast.success("Personal genre renamed everywhere.");
    } catch (nextError) {
      toast.error(nextError.message || "Could not rename that genre.");
    } finally {
      setBusyId(null);
    }
  };

  const mergeGenre = async (genre) => {
    const targetId = Number(mergeTargets[genre.id]);
    const target = genres.find((item) => item.id === targetId);
    if (!target) return;
    const accepted = await confirm({
      title: "Merge personal genres?",
      message: `Every “${genre.name}” game will use “${target.name}”. This cannot be undone.`,
      confirmLabel: "Merge genres",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      setBusyId(genre.id);
      await mergePersonalGenre(genre.id, targetId);
      await reloadAll();
      toast.success(`Merged into ${target.name}.`);
    } catch (nextError) {
      toast.error(nextError.message || "Could not merge those genres.");
    } finally {
      setBusyId(null);
    }
  };

  const removeGenre = async (genre) => {
    const accepted = await confirm({
      title: "Delete unused genre?",
      message: `Delete “${genre.name}”? Used genres must be removed from games or merged first.`,
      confirmLabel: "Delete genre",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      setBusyId(genre.id);
      await deletePersonalGenre(genre.id);
      await refresh();
      toast.success("Personal genre deleted.");
    } catch (nextError) {
      toast.error(nextError.message || "Could not delete that genre.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-panel border border-surface-border bg-surface-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Tags className="h-5 w-5 text-content-muted" aria-hidden="true" />
            Personal genres
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Reuse your own genres across games. Rename once, or merge duplicates safely.
          </p>
        </div>
        <Badge variant="default">{genres.length} total</Badge>
      </div>

      <form onSubmit={addGenre} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field id="new-personal-genre" label="Add a personal genre" className="min-w-0 flex-1">
          <TextInput
            id="new-personal-genre"
            value={newName}
            maxLength={50}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="e.g., Cozy strategy"
            disabled={busyId === "new"}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={!newName.trim() || busyId === "new"}>
          {busyId === "new" ? "Saving..." : "Add genre"}
        </Button>
      </form>

      {loading ? (
        <div className="mt-5 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : error ? (
        <div className="mt-5 rounded-xl border border-state-error/35 bg-state-error/10 p-4 text-sm text-state-error" role="alert">
          Could not load personal genres. <Button type="button" size="sm" variant="ghost" onClick={() => refresh().catch(() => {})}>Try again</Button>
        </div>
      ) : !genres.length ? (
        <EmptyState className="mt-5" icon={Tags} title="No personal genres yet" description="Add one here or create it while editing a game." />
      ) : (
        <div className="mt-5 space-y-3">
          {genres.map((genre) => {
            const busy = busyId === genre.id;
            const targetOptions = options.filter((option) => Number(option.value) !== genre.id);
            return (
              <div key={genre.id} className="rounded-xl border border-surface-border bg-surface-bg/35 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    {editingId === genre.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <TextInput aria-label={`Rename ${genre.name}`} value={editingName} maxLength={50} onChange={(event) => setEditingName(event.target.value)} disabled={busy} />
                        <Button type="button" size="sm" variant="primary" onClick={() => saveRename(genre)} disabled={!editingName.trim() || busy}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={busy}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="break-words font-medium text-content-primary">{genre.name}</span>
                        <Badge variant={genre.usageCount ? "default" : "success"}>{genre.usageCount} {genre.usageCount === 1 ? "game" : "games"}</Badge>
                      </div>
                    )}
                  </div>
                  {editingId !== genre.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { setEditingId(genre.id); setEditingName(genre.name); }}>Rename</Button>
                      {targetOptions.length ? (
                        <div className="flex min-w-0 gap-2">
                          <SelectMenu aria-label={`Merge ${genre.name} into`} value={mergeTargets[genre.id] || ""} placeholder="Merge into..." options={targetOptions} onChange={(value) => setMergeTargets((current) => ({ ...current, [genre.id]: value }))} disabled={busy} />
                          <Button type="button" size="sm" variant="secondary" disabled={!mergeTargets[genre.id] || busy} onClick={() => mergeGenre(genre)}>Merge</Button>
                        </div>
                      ) : null}
                      <Button type="button" size="sm" variant="dangerGhost" disabled={busy} onClick={() => removeGenre(genre)}>Delete</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
