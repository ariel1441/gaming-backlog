import { Link } from "react-router-dom";
import {
  Database,
  DatabaseZap,
  Globe,
  LibraryBig,
  Link as LinkIcon,
  SlidersHorizontal,
  User2,
} from "lucide-react";
import { AppPage, PageHeader } from "../../components/layout";
import { Badge, Button, Skeleton } from "../../components/ui";

export const settingsSections = [
  { id: "profile", label: "Profile", icon: User2 },
  { id: "account", label: "Account", icon: User2 },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "public", label: "Public profile", icon: Globe },
  { id: "data", label: "Data", icon: Database },
  { id: "metadata", label: "Game metadata", icon: DatabaseZap },
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

export function SettingsNav({ activeSection, onSelect }) {
  return (
    <nav aria-label="Settings sections">
      <div className="flex gap-2 overflow-x-auto border-b border-surface-border pb-3">
        {settingsSections.map(({ id, label, icon: Icon }) => {
          const active = id === activeSection;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={[
                "flex min-w-max items-center gap-2 rounded-control px-3 py-2.5 text-left text-sm font-medium transition-colors",
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
    </nav>
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

export function AccountSection({ user, isGuest, games }) {
  const status = isGuest
    ? { label: "Demo", variant: "warning" }
    : user?.is_public
      ? { label: "Public profile on", variant: "success" }
      : { label: "Private profile", variant: "default" };

  return (
    <section className="rounded-panel border border-surface-border bg-surface-card p-5 shadow-panel">
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
        <InfoTile
          label="Account type"
          value={isGuest ? "Demo session" : "Signed in"}
        />
        <InfoTile label="Joined" value={formatDate(user?.created_at)} />
        <InfoTile label="Games" value={games.length} />
      </div>
      {isGuest ? (
        <div className="mt-5 rounded-xl border border-state-warning/40 bg-state-warning/10 p-4 text-sm leading-6 text-state-warning">
          Demo sessions are temporary. Save the demo from the backlog account
          menu before relying on this data.
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

export function SettingsSkeleton() {
  return (
    <AppPage width="standard">
      <PageHeader
        title="Settings"
        description="Manage your account and application preferences."
      />
      <div className="space-y-5 pt-6">
        <section className="rounded-panel border border-surface-border bg-surface-card p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-56" />
            </div>
          </div>
        </section>
        <div className="grid gap-5 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <Skeleton className="h-52" />
          <div className="space-y-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </div>
    </AppPage>
  );
}
