import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
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
  SlidersHorizontal,
  User2,
} from "lucide-react";
import ProfileFavoritesEditor, {
  getFavoriteIds,
} from "../components/ProfileFavoritesEditor";
import ProfileSnapshot from "../components/ProfileSnapshot";
import { AppPage, PageError, PageHeader } from "../components/layout";
import PublicToggleCard from "../components/PublicToggleCard";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  SelectMenu,
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
import {
  AccountSection,
  SettingsNav,
  SettingsSkeleton,
  settingsSections,
} from "./Settings/SettingsShell";
import {
  DataSection,
  IntegrationsSection,
} from "./Settings/SettingsDataSections";
import { ProfileSection } from "./Settings/ProfileSettings";
import { PreferencesSection } from "./Settings/PreferencesSettings";
import { ThemeSettings } from "./Settings/ThemeSettings";
import { PublicProfileSection } from "./Settings/PublicProfileSettings";
import MetadataSettings from "./Settings/MetadataSettings";

const MAX_FAVORITES = 5;

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
  const {
    games,
    loading: gamesLoading,
    error: gamesError,
    refresh,
    updateFavorites,
  } = useGames();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section") || "profile";
  const activeSection = settingsSections.some(
    (section) => section.id === requestedSection,
  )
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
              <Button
                type="button"
                variant="secondary"
                onClick={startDemoAndNavigate}
              >
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
    <AppPage width="standard">
      <div className="space-y-5">
        <PageHeader
          title="Settings"
          description="Manage your account, profile, preferences, data, and connected services."
          meta={profileHandle(user)}
          actions={
            <Button as={Link} to="/me" variant="secondary">
              <User2 className="h-4 w-4" aria-hidden="true" />
              My profile
            </Button>
          }
        />

        {gamesError ? (
          <PageError
            title="Could not load your backlog data."
            description={
              gamesError?.message || "Try again before changing settings."
            }
            onRetry={() => refresh()}
            retryLabel="Retry"
          />
        ) : (
          <div className="space-y-5">
            <SettingsNav
              activeSection={activeSection}
              onSelect={setActiveSection}
            />
            <div
              id={`settings-panel-${activeSection}`}
              role="tabpanel"
              tabIndex={0}
              aria-labelledby={`settings-tab-${activeSection}`}
              className="min-w-0 space-y-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-4 focus-visible:ring-offset-surface-bg"
            >
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
                <>
                  <ThemeSettings />
                  <PreferencesSection
                    user={user}
                    isGuest={isGuest}
                    updatePreferences={updatePreferences}
                  />
                </>
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
              {activeSection === "metadata" ? (
                <MetadataSettings
                  games={games}
                  isGuest={isGuest}
                  refreshGames={() => refresh({ silent: true })}
                />
              ) : null}
              {activeSection === "integrations" ? (
                <IntegrationsSection isGuest={isGuest} />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AppPage>
  );
}
