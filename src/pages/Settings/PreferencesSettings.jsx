import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  SelectMenu,
  Switch,
  TextInput,
  useToast,
} from "../../components/ui";
import {
  backlogSortOptions,
  backlogViewOptions,
  landingPathOptions,
  normalizeUserPreferences,
} from "../../utils/userPreferences";
export function PreferencesSection({ user, isGuest, updatePreferences }) {
  const toast = useToast();
  const savedPreferences = useMemo(
    () => normalizeUserPreferences(user?.preferences),
    [user?.preferences],
  );
  const [draft, setDraft] = useState(savedPreferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(savedPreferences);
    setError("");
  }, [savedPreferences]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedPreferences);
  const disabled = isGuest || !updatePreferences;

  const updateDraft = (key, value) => {
    setError("");
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (disabled || !dirty) return;
    try {
      setSaving(true);
      setError("");
      await updatePreferences(draft);
      toast.success("Preferences saved.");
    } catch (err) {
      setError(err?.message || "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <SlidersHorizontal
              className="h-5 w-5 text-content-muted"
              aria-hidden="true"
            />
            Preferences
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Choose the default view and route the app uses when you start a new
            session.
          </p>
        </div>
        <Badge variant={isGuest ? "warning" : dirty ? "warning" : "success"}>
          {isGuest ? "Demo defaults" : dirty ? "Unsaved changes" : "Saved"}
        </Badge>
      </div>

      {isGuest ? (
        <div className="mt-5 rounded-xl border border-state-warning/40 bg-state-warning/10 p-4 text-sm leading-6 text-state-warning">
          Demo sessions can preview these defaults, but saving account
          preferences is available after saving the demo as your account.
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-state-error/40 bg-state-error/10 p-4 text-sm leading-6 text-state-error">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field
          id="default-backlog-view"
          label="Default backlog view"
          help="Used when you open the backlog without choosing another view."
        >
          <SelectMenu
            id="default-backlog-view"
            value={draft.default_backlog_view}
            onChange={(value) => updateDraft("default_backlog_view", value)}
            options={backlogViewOptions}
            disabled={disabled || saving}
          />
        </Field>

        <Field
          id="default-backlog-sort"
          label="Default backlog sort"
          help="The default order for the backlog toolbar."
        >
          <SelectMenu
            id="default-backlog-sort"
            value={draft.default_backlog_sort_key}
            onChange={(value) => updateDraft("default_backlog_sort_key", value)}
            options={backlogSortOptions}
            disabled={disabled || saving}
          />
        </Field>

        <Field
          id="default-landing-path"
          label="Landing page after sign-in"
          help="Applied only after explicit sign-in, account creation, or demo start."
        >
          <SelectMenu
            id="default-landing-path"
            value={draft.default_landing_path}
            onChange={(value) => updateDraft("default_landing_path", value)}
            options={landingPathOptions}
            disabled={disabled || saving}
          />
        </Field>

        <div className="flex flex-col justify-end">
          <Switch
            checked={draft.default_backlog_sort_reversed}
            onChange={(checked) =>
              updateDraft("default_backlog_sort_reversed", checked)
            }
            label="Reverse default sort"
            description="Use descending order for the selected default sort."
            disabled={disabled || saving}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDraft(savedPreferences)}
          disabled={!dirty || saving}
        >
          Reset
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={save}
          disabled={disabled || saving || !dirty}
        >
          {saving ? "Saving..." : "Save preferences"}
        </Button>
      </div>
    </section>
  );
}

export function InsightPreferences() {
  const [weeklyHours, setWeeklyHours] = useState(() => {
    const value = Number(localStorage.getItem("insights.wh"));
    return Number.isFinite(value) ? value : 10;
  });
  const [includeMissing, setIncludeMissing] = useState(
    () => localStorage.getItem("insights.missing") === "true",
  );

  const updateWeeklyHours = (value) => {
    const next = Math.max(0, Math.min(999, Number(value) || 0));
    setWeeklyHours(next);
    localStorage.setItem("insights.wh", String(next));
  };

  const updateIncludeMissing = (checked) => {
    setIncludeMissing(checked);
    localStorage.setItem("insights.missing", String(checked));
  };

  return (
    <div className="mt-6 border-t border-surface-border pt-5">
      <h3 className="text-base font-semibold text-content-primary">
        Insights planning
      </h3>
      <p className="mt-1 text-sm text-content-muted">
        Defaults used for estimates and missing-duration calculations.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field id="insights-weekly-hours" label="Weekly gaming hours">
          <TextInput
            id="insights-weekly-hours"
            type="number"
            min="0"
            max="999"
            value={weeklyHours}
            onChange={(event) => updateWeeklyHours(event.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Switch
            checked={includeMissing}
            onChange={updateIncludeMissing}
            label="Include games with missing hours"
            description="Use fallback estimates when duration data is unavailable."
          />
        </div>
      </div>
    </div>
  );
}
