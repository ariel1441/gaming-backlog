import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Copy,
  Database,
  Download,
  ExternalLink,
  Gamepad2,
  Globe,
  LibraryBig,
  Link as LinkIcon,
  LockKeyhole,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  User2,
} from "lucide-react";
import ProfileFavoritesEditor, {
  getFavoriteIds,
} from "../components/ProfileFavoritesEditor";
import ProfileSnapshot from "../components/ProfileSnapshot";
import PublicToggleCard from "../components/PublicToggleCard";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  SelectMenu,
  Skeleton,
  Switch,
  Textarea,
  TextInput,
  useToast,
} from "../components/ui";
import ProfileAvatar, {
  profileAvatarColorClass,
  profileAvatarIcon,
} from "../components/ProfileAvatar";
import { useAuth } from "../contexts/AuthContext";
import { useGames } from "../hooks/useGames";
import { getSteamAccount, startSteamLink } from "../services/steamService";
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  avatarColorOptions,
  avatarIconGroups,
  normalizeProfileFields,
  profileDisplayName,
  profileHandle,
} from "../utils/userProfile";
import {
  backlogSortOptions,
  backlogViewOptions,
  landingPathOptions,
  normalizeUserPreferences,
  preferredLandingPath,
} from "../utils/userPreferences";

const MAX_FAVORITES = 5;

const sections = [
  { id: "profile", label: "Profile", icon: User2 },
  { id: "account", label: "Account", icon: User2 },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "public", label: "Public profile", icon: Globe },
  { id: "data", label: "Data", icon: Database },
  { id: "integrations", label: "Integrations", icon: LinkIcon },
];

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function publicProfileUrl(username) {
  if (!username) return "";
  if (typeof window === "undefined") return `/u/${username}`;
  return `${window.location.origin}/u/${username}`;
}

function csvValue(value) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function exportBacklogCsv(games) {
  const fields = [
    ["id", "id"],
    ["name", "name"],
    ["status", "status"],
    ["genre", "my_genre"],
    ["score", "my_score"],
    ["estimated_hours", "how_long_to_beat"],
    ["started_at", "started_at"],
    ["finished_at", "finished_at"],
    ["thoughts", "thoughts"],
    ["rawg_id", "rawg_id"],
    ["rawg_slug", "rawg_slug"],
    ["release_date", "releaseDate"],
    ["cover", "cover"],
    ["favorite_rank", "favorite_rank"],
    ["catalog_game_id", "catalog_game_id"],
  ];
  const lines = [
    fields.map(([label]) => csvValue(label)).join(","),
    ...games.map((game) =>
      fields.map(([, key]) => csvValue(game?.[key])).join(",")
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export default function SettingsPage() {
  const {
    user,
    loading: authLoading,
    isAuthenticated,
    isGuest,
    startDemo,
    updateProfile,
    updatePreferences,
  } = useAuth();
  const navigate = useNavigate();
  const { games, loading: gamesLoading, error: gamesError, refresh, updateFavorites } =
    useGames();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section") || "profile";
  const activeSection = sections.some((section) => section.id === requestedSection)
    ? requestedSection
    : "account";

  const setActiveSection = (section) => {
    const next = new URLSearchParams(searchParams);
    if (section === "profile") next.delete("section");
    else next.set("section", section);
    setSearchParams(next, { replace: false });
  };
  const startDemoAndNavigate = async () => {
    const res = await startDemo();
    if (res?.success) navigate(preferredLandingPath(res.user));
  };

  if (authLoading || (isAuthenticated && gamesLoading)) {
    return <SettingsSkeleton />;
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <EmptyState
          icon={LockKeyhole}
          title="Sign in to manage settings."
          description="Settings are tied to your private backlog, public profile, and connected services."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button as={Link} to="/" variant="primary">
                <LibraryBig className="h-4 w-4" aria-hidden="true" />
                Back to backlog
              </Button>
              <Button type="button" variant="secondary" onClick={startDemoAndNavigate}>
                Try demo
              </Button>
            </div>
          }
          className="w-full max-w-lg"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-bg px-3 py-4 text-content-primary sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar profile={user} size="md" />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
                  Settings
                </div>
                <h1 className="mt-1 truncate text-3xl font-semibold leading-tight">
                  {profileDisplayName(user)}
                </h1>
                <div className="mt-1 truncate text-sm text-content-muted">
                  {profileHandle(user)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button as={Link} to="/me" variant="secondary">
                <User2 className="h-4 w-4" aria-hidden="true" />
                My profile
              </Button>
              <Button as={Link} to="/" variant="secondary">
                <LibraryBig className="h-4 w-4" aria-hidden="true" />
                Backlog
              </Button>
            </div>
          </div>
        </header>

        {gamesError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Could not load your backlog data."
            description={gamesError?.message || "Try again before changing settings."}
            action={
              <Button type="button" variant="primary" onClick={() => refresh()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />
            <div className="min-w-0 space-y-5">
              {activeSection === "account" ? (
                <AccountSection user={user} isGuest={isGuest} games={games} />
              ) : null}
              {activeSection === "profile" ? (
                <ProfileSection
                  user={user}
                  isGuest={isGuest}
                  updateProfile={updateProfile}
                />
              ) : null}
              {activeSection === "preferences" ? (
                <PreferencesSection
                  user={user}
                  isGuest={isGuest}
                  updatePreferences={updatePreferences}
                />
              ) : null}
              {activeSection === "public" ? (
                <PublicProfileSection
                  user={user}
                  isGuest={isGuest}
                  games={games}
                  updateFavorites={updateFavorites}
                />
              ) : null}
              {activeSection === "data" ? <DataSection games={games} /> : null}
              {activeSection === "integrations" ? (
                <IntegrationsSection isGuest={isGuest} />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function SettingsNav({ activeSection, onSelect }) {
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-surface-border bg-surface-card p-2 shadow-panel lg:grid">
        {sections.map(({ id, label, icon: Icon }) => {
          const active = id === activeSection;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={[
                "flex min-w-max items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary-light"
                  : "text-content-secondary hover:bg-surface-elevated hover:text-content-primary",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function AccountSection({ user, isGuest, games }) {
  const status = isGuest
    ? { label: "Demo", variant: "warning" }
    : user?.is_public
      ? { label: "Public profile on", variant: "success" }
      : { label: "Private profile", variant: "default" };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <User2 className="h-5 w-5 text-content-muted" aria-hidden="true" />
            Account
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            This page keeps the account controls that already exist in the app.
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Username" value={`@${user?.username || "you"}`} />
        <InfoTile label="Account type" value={isGuest ? "Demo session" : "Signed in"} />
        <InfoTile label="Joined" value={formatDate(user?.created_at)} />
        <InfoTile label="Games" value={games.length} />
      </div>

      {isGuest ? (
        <div className="mt-5 rounded-xl border border-state-warning/40 bg-state-warning/10 p-4 text-sm leading-6 text-state-warning">
          Demo sessions are temporary. Save the demo from the backlog account menu
          before relying on this data.
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button as={Link} to="/me" variant="primary">
          <User2 className="h-4 w-4" aria-hidden="true" />
          My profile
        </Button>
        <Button as={Link} to="/" variant="secondary">
          <LibraryBig className="h-4 w-4" aria-hidden="true" />
          Backlog
        </Button>
      </div>
    </section>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-bg/35 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-content-muted">
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-content-primary">
        {value}
      </div>
    </div>
  );
}

function ProfileSection({ user, isGuest, updateProfile }) {
  const toast = useToast();
  const savedProfile = useMemo(
    () => normalizeProfileFields(user),
    [user]
  );
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
        <Badge variant={isGuest ? "warning" : dirty ? "primary" : "success"}>
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
              {active ? <span className="h-2.5 w-2.5 rounded-full bg-current" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreferencesSection({ user, isGuest, updatePreferences }) {
  const toast = useToast();
  const savedPreferences = useMemo(
    () => normalizeUserPreferences(user?.preferences),
    [user?.preferences]
  );
  const [draft, setDraft] = useState(savedPreferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(savedPreferences);
    setError("");
  }, [savedPreferences]);

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(savedPreferences);
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
            <SlidersHorizontal className="h-5 w-5 text-content-muted" aria-hidden="true" />
            Preferences
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Choose the default view and route the app uses when you start a new session.
          </p>
        </div>
        <Badge variant={isGuest ? "warning" : dirty ? "primary" : "success"}>
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

function PublicProfileSection({ user, isGuest, games, updateFavorites }) {
  const toast = useToast();
  const initialFavoriteIds = useMemo(() => getFavoriteIds(games), [games]);
  const [favoriteIds, setFavoriteIds] = useState(initialFavoriteIds);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [savingFavorites, setSavingFavorites] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");

  useEffect(() => {
    setFavoriteIds(initialFavoriteIds);
  }, [initialFavoriteIds]);

  if (isGuest) {
    return (
      <EmptyState
        icon={Globe}
        title="Public profile controls are off in demo mode."
        description="Demo sessions stay private, so sharing controls and public favorites are hidden here."
        action={
          <Button as={Link} to="/" variant="primary">
            Back to backlog
          </Button>
        }
      />
    );
  }

  const publicUrl = publicProfileUrl(user?.username);
  const isPublic = !!user?.is_public;
  const favoriteGames = favoriteIds
    .map((id) => games.find((game) => Number(game.id) === Number(id)))
    .filter(Boolean);
  const favoriteIdSet = new Set(favoriteIds.map(Number));
  const filteredGames = games
    .filter((game) => {
      const query = favoriteSearch.trim().toLowerCase();
      if (!query) return true;
      return String(game.name || "").toLowerCase().includes(query);
    })
    .slice(0, 40);
  const hasFavoriteChanges =
    JSON.stringify(favoriteIds.map(Number)) !==
    JSON.stringify(initialFavoriteIds.map(Number));

  const copyPublicUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public profile link copied.");
    } catch {
      toast.info(publicUrl, {
        title: "Copy this public profile link",
        duration: 7000,
      });
    }
  };

  const openPublicUrl = () => {
    if (!publicUrl) return;
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  };

  const addFavorite = (game) => {
    const id = Number(game.id);
    if (!Number.isFinite(id) || favoriteIdSet.has(id)) return;
    if (favoriteIds.length >= MAX_FAVORITES) {
      toast.info("Remove a favorite before adding another one.", {
        title: "Favorite slots are full",
      });
      return;
    }
    setFavoriteError("");
    setFavoriteIds((current) => [...current, id]);
  };

  const removeFavorite = (id) => {
    setFavoriteError("");
    setFavoriteIds((current) =>
      current.filter((item) => Number(item) !== Number(id))
    );
  };

  const moveFavorite = (id, direction) => {
    setFavoriteError("");
    setFavoriteIds((current) => {
      const index = current.findIndex((item) => Number(item) === Number(id));
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const saveFavorites = async () => {
    try {
      setSavingFavorites(true);
      setFavoriteError("");
      await updateFavorites(favoriteIds.map(Number));
      toast.success("Favorite games saved.");
    } catch (err) {
      setFavoriteError(err.message || "Could not save favorite games.");
    } finally {
      setSavingFavorites(false);
    }
  };

  return (
    <div className="space-y-5">
      <PublicToggleCard />
      <ProfileFavoritesEditor
        games={filteredGames}
        favoriteGames={favoriteGames}
        favoriteIds={favoriteIds}
        favoriteIdSet={favoriteIdSet}
        search={favoriteSearch}
        setSearch={setFavoriteSearch}
        addFavorite={addFavorite}
        removeFavorite={removeFavorite}
        moveFavorite={moveFavorite}
        onSave={saveFavorites}
        saving={savingFavorites}
        disabled={!updateFavorites}
        hasChanges={hasFavoriteChanges}
        error={favoriteError}
      />
      <section className="rounded-2xl border border-surface-border bg-surface-card p-4 shadow-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Public preview</h2>
            <p className="mt-1 text-sm leading-6 text-content-muted">
              This mirrors the read-only profile people see when sharing is on.
            </p>
          </div>
          {isPublic ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={copyPublicUrl}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy
              </Button>
              <Button type="button" variant="secondary" onClick={openPublicUrl}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open
              </Button>
            </div>
          ) : null}
        </div>
        <ProfileSnapshot
          profile={user}
          games={games}
          publicUrl={isPublic ? publicUrl : ""}
          joinedAt={formatDate(user?.created_at)}
          variant="settingsPreview"
          isPublic={isPublic}
          onCopy={isPublic ? copyPublicUrl : undefined}
          onOpenPublic={isPublic ? openPublicUrl : undefined}
        />
      </section>
    </div>
  );
}

function DataSection({ games }) {
  const toast = useToast();

  const exportCsv = () => {
    const csv = exportBacklogCsv(games);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `gaming-backlog-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV export started.");
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Database className="h-5 w-5 text-content-muted" aria-hidden="true" />
            Data
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Export a private backlog CSV from the data already loaded in the app.
          </p>
        </div>
        <Badge variant="default">{games.length} games</Badge>
      </div>

      <div className="mt-5 rounded-xl border border-surface-border bg-surface-bg/35 p-4">
        <Field
          id="csv-export-name"
          label="CSV export"
          help="Includes game list fields such as title, status, score, dates, notes, cover, and favorite rank. Account credentials and Steam integration details are not included."
        >
          <TextInput
            id="csv-export-name"
            readOnly
            value={`gaming-backlog-${new Date().toISOString().slice(0, 10)}.csv`}
          />
        </Field>
        <div className="mt-4">
          <Button
            type="button"
            variant="primary"
            onClick={exportCsv}
            disabled={!games.length}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </div>
    </section>
  );
}

function IntegrationsSection({ isGuest }) {
  const toast = useToast();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(!isGuest);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (isGuest) {
      setLoading(false);
      return undefined;
    }

    let ignore = false;
    setLoading(true);
    setError("");
    getSteamAccount()
      .then((payload) => {
        if (!ignore) setAccount(payload?.account || null);
      })
      .catch((err) => {
        if (!ignore) setError(err?.message || "Could not load Steam account.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [isGuest]);

  const linkSteam = async () => {
    try {
      setLinking(true);
      const payload = await startSteamLink();
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }
      toast.info("Steam did not return a link URL.");
    } catch (err) {
      toast.error(err?.message || "Could not start Steam link.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LinkIcon className="h-5 w-5 text-content-muted" aria-hidden="true" />
            Integrations
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Steam linking and import stay in the dedicated Steam screens.
          </p>
        </div>
        <Badge variant={account ? "success" : "default"}>
          {account ? "Steam linked" : "Steam not linked"}
        </Badge>
      </div>

      {isGuest ? (
        <div className="mt-5 rounded-xl border border-surface-border bg-surface-bg/35 p-4 text-sm leading-6 text-content-muted">
          Steam linking is unavailable in demo sessions.
        </div>
      ) : loading ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-10 w-64" />
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-surface-border bg-surface-bg/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {account?.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg border border-surface-border object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-surface-border bg-surface-elevated text-content-muted">
                  <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-content-primary">
                  {account?.displayName || "Steam account"}
                </div>
                <div className="mt-1 text-sm text-content-muted">
                  {account?.steamId
                    ? `SteamID ${account.steamId}`
                    : "Connect Steam to review and import your owned games."}
                </div>
                {error ? (
                  <div className="mt-2 text-xs text-state-error">{error}</div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {account?.profileUrl ? (
                <Button
                  as="a"
                  href={account.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  variant="secondary"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Steam profile
                </Button>
              ) : null}
              {!account ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={linkSteam}
                  disabled={linking}
                >
                  <LinkIcon className="h-4 w-4" aria-hidden="true" />
                  {linking ? "Opening..." : "Link Steam"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button as={Link} to="/steam/library" variant="secondary">
          <LibraryBig className="h-4 w-4" aria-hidden="true" />
          Steam Library
        </Button>
        <Button as={Link} to="/steam/import" variant="secondary">
          <Download className="h-4 w-4" aria-hidden="true" />
          Steam Import
        </Button>
      </div>
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <main className="min-h-screen bg-surface-bg px-3 py-4 text-content-primary sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-56" />
            </div>
          </div>
        </section>
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <Skeleton className="h-52" />
          <div className="space-y-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </div>
    </main>
  );
}
