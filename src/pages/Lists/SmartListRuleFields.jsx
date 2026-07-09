import React from "react";
import { Checkbox, Field, SelectMenu, TextInput } from "../../components/ui";
import {
  SMART_CONTROL_OPTIONS,
  SMART_SORT_OPTIONS,
  SMART_STATUS_OPTIONS,
  smartListGenres,
  smartListYears,
} from "../../utils/automaticLists";

function numberValue(value) {
  return value == null || value === "" ? "" : String(value);
}

export default function SmartListRuleFields({
  games = [],
  query,
  sortKey,
  onQueryChange,
  onSortChange,
  disabled = false,
}) {
  const finishedYears = smartListYears(games);
  const releaseYears = smartListYears(games, "release");
  const genres = smartListGenres(games);

  const update = (patch) => {
    onQueryChange?.({ ...(query || {}), ...patch });
  };
  const exposedControls = Array.isArray(query?.exposedControls) ? query.exposedControls : [];
  const toggleExposedControl = (control, checked) => {
    const next = checked
      ? Array.from(new Set([...exposedControls, control]))
      : exposedControls.filter((value) => value !== control);
    update({ exposedControls: next });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="smart-status" label="Games">
          <SelectMenu
            id="smart-status"
            value={query?.status || ""}
            onChange={(value) => update({ status: value || null })}
            options={SMART_STATUS_OPTIONS}
            disabled={disabled}
          />
        </Field>

        <Field id="smart-sort" label="Ranking">
          <SelectMenu
            id="smart-sort"
            value={sortKey || "score"}
            onChange={onSortChange}
            options={SMART_SORT_OPTIONS}
            disabled={disabled}
          />
        </Field>

        <Field id="smart-finished-year" label="Finished year">
          <SelectMenu
            id="smart-finished-year"
            value={numberValue(query?.finishedYear)}
            onChange={(value) => update({ finishedYear: value ? Number(value) : null })}
            placeholder="Any year"
            options={[
              { value: "", label: "Any year" },
              ...finishedYears.map((year) => ({ value: String(year), label: String(year) })),
            ]}
            disabled={disabled}
          />
        </Field>

        <Field id="smart-release-year" label="Release year">
          <SelectMenu
            id="smart-release-year"
            value={numberValue(query?.releasedYear)}
            onChange={(value) => update({ releasedYear: value ? Number(value) : null })}
            placeholder="Any year"
            options={[
              { value: "", label: "Any year" },
              ...releaseYears.map((year) => ({ value: String(year), label: String(year) })),
            ]}
            disabled={disabled}
          />
        </Field>

        <Field id="smart-genre" label="Genre">
          <SelectMenu
            id="smart-genre"
            value={query?.genre || ""}
            onChange={(value) => update({ genre: value || null })}
            placeholder="Any genre"
            options={[
              { value: "", label: "Any genre" },
              ...genres.map((genre) => ({ value: genre.value, label: genre.value })),
            ]}
            disabled={disabled}
          />
        </Field>

        <Field id="smart-max-hours" label="Max hours">
          <TextInput
            id="smart-max-hours"
            type="number"
            min="0"
            max="1000"
            step="0.5"
            value={numberValue(query?.maxHours)}
            onChange={(event) =>
              update({
                maxHours: event.target.value === "" ? null : Number(event.target.value),
              })
            }
            placeholder="Any"
            disabled={disabled}
          />
        </Field>

        <Field id="smart-min-score" label="Minimum score">
          <TextInput
            id="smart-min-score"
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={numberValue(query?.minScore)}
            onChange={(event) =>
              update({
                minScore: event.target.value === "" ? null : Number(event.target.value),
              })
            }
            placeholder="Any"
            disabled={disabled}
          />
        </Field>

        <Field id="smart-missing-hours" label="Hours data">
          <SelectMenu
            id="smart-missing-hours"
            value={query?.missingHours ? "missing" : ""}
            onChange={(value) => update({ missingHours: value === "missing" })}
            options={[
              { value: "", label: "Any hours state" },
              { value: "missing", label: "Missing hours only" },
            ]}
            disabled={disabled}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
        <div className="text-sm font-semibold text-content-primary">
          Show on list page
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SMART_CONTROL_OPTIONS.map((option) => (
            <Checkbox
              key={option.value}
              checked={exposedControls.includes(option.value)}
              onChange={(checked) => toggleExposedControl(option.value, checked)}
              label={option.label}
              description="Quickly change this parameter after opening the list."
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
