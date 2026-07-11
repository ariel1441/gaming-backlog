import { useEffect, useMemo, useState } from "react";
import { Check, Palette, User2 } from "lucide-react";
import ProfileSnapshot from "../../components/ProfileSnapshot";
import ProfileAvatar, {
  profileAvatarColorClass,
  profileAvatarIcon,
} from "../../components/ProfileAvatar";
import {
  Badge,
  Button,
  Field,
  Textarea,
  TextInput,
  useToast,
} from "../../components/ui";
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  avatarColorOptions,
  avatarIconGroups,
  normalizeProfileFields,
  profileDisplayName,
  profileHandle,
} from "../../utils/userProfile";
import { InsightPreferences } from "./PreferencesSettings";
export function ProfileSection({ user, isGuest, updateProfile }) {
  const toast = useToast();
  const savedProfile = useMemo(() => normalizeProfileFields(user), [user]);
  const [draft, setDraft] = useState(savedProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(savedProfile);
    setError("");
  }, [savedProfile]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedProfile);
  const disabled = isGuest || !updateProfile;

  const updateDraft = (key, value) => {
    setError("");
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (disabled || !dirty) return;
    try {
      setSaving(true);
      setError("");
      await updateProfile(draft);
      toast.success("Profile saved.");
    } catch (err) {
      setError(err?.message || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const previewProfile = {
    ...user,
    ...draft,
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <User2 className="h-5 w-5 text-content-muted" aria-hidden="true" />
            Profile
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Set the identity shown on your owner profile and public profile.
          </p>
        </div>
        <Badge variant={isGuest ? "warning" : dirty ? "warning" : "success"}>
          {isGuest ? "Demo preview" : dirty ? "Unsaved changes" : "Saved"}
        </Badge>
      </div>

      {isGuest ? (
        <div className="mt-5 rounded-xl border border-state-warning/40 bg-state-warning/10 p-4 text-sm leading-6 text-state-warning">
          Demo sessions can preview profile basics, but saving profile identity
          is available after saving the demo as your account.
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-state-error/40 bg-state-error/10 p-4 text-sm leading-6 text-state-error">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="profile-display-name"
              label="Display name"
              help={`${draft.display_name.length}/${DISPLAY_NAME_MAX_LENGTH} characters. Leave blank to use your username.`}
            >
              <TextInput
                id="profile-display-name"
                value={draft.display_name}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                onChange={(event) =>
                  updateDraft("display_name", event.target.value)
                }
                placeholder="Your profile name"
                disabled={disabled || saving}
              />
            </Field>
            <Field
              id="profile-bio"
              label="Bio"
              help={`${draft.bio.length}/${BIO_MAX_LENGTH} characters.`}
            >
              <Textarea
                id="profile-bio"
                value={draft.bio}
                maxLength={BIO_MAX_LENGTH}
                onChange={(event) => updateDraft("bio", event.target.value)}
                placeholder="A short note about your gaming taste..."
                disabled={disabled || saving}
              />
            </Field>
          </div>

          <AvatarIconPicker
            value={draft.avatar_icon}
            onChange={(value) => updateDraft("avatar_icon", value)}
            disabled={disabled || saving}
          />

          <AvatarColorPicker
            value={draft.avatar_color}
            onChange={(value) => updateDraft("avatar_color", value)}
            disabled={disabled || saving}
          />
        </div>

        <aside className="rounded-2xl border border-surface-border bg-surface-bg/35 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
            Preview
          </div>
          <div className="mt-4 flex items-start gap-4">
            <ProfileAvatar profile={previewProfile} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-2xl font-semibold text-content-primary">
                {profileDisplayName(previewProfile)}
              </div>
              <div className="mt-1 truncate text-sm text-content-muted">
                {profileHandle(previewProfile)}
              </div>
              {draft.bio ? (
                <p className="mt-3 text-sm leading-6 text-content-secondary">
                  {draft.bio}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-content-muted">
                  Add a short bio to introduce your profile.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <InsightPreferences />

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDraft(savedProfile)}
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
          {saving ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </section>
  );
}

function AvatarIconPicker({ value, onChange, disabled }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-content-primary">
        <Palette className="h-4 w-4 text-content-muted" aria-hidden="true" />
        Icon bank
      </div>
      <div className="mt-3 space-y-4">
        {avatarIconGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
              {group.label}
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {group.icons.map((option) => {
                const Icon = profileAvatarIcon(option.value);
                const active = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    disabled={disabled}
                    title={option.label}
                    aria-label={`Choose ${option.label} avatar icon`}
                    className={[
                      "flex aspect-square items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-primary bg-primary/15 text-primary-light"
                        : "border-surface-border bg-surface-bg/45 text-content-muted hover:border-primary/45 hover:text-content-primary",
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvatarColorPicker({ value, onChange, disabled }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-content-primary">
        Avatar color
      </div>
      <div className="flex flex-wrap gap-2">
        {avatarColorOptions.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              aria-label={`Choose ${option.label} avatar color`}
              title={option.label}
              className={[
                "flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm transition-transform disabled:cursor-not-allowed disabled:opacity-60",
                profileAvatarColorClass(option.value),
                active ? "scale-105 ring-2 ring-primary/50" : "hover:scale-105",
              ].join(" ")}
            >
              {active ? (
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
