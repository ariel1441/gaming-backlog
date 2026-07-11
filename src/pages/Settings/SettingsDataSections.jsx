import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Database,
  Download,
  ExternalLink,
  Gamepad2,
  LibraryBig,
  Link as LinkIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Skeleton,
  TextInput,
  useToast,
} from "../../components/ui";
import { getSteamAccount, startSteamLink } from "../../services/steamService";

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
      fields.map(([, key]) => csvValue(game?.[key])).join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
export function DataSection({ games }) {
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
            <Database
              className="h-5 w-5 text-content-muted"
              aria-hidden="true"
            />
            Data
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Export a private backlog CSV from the data already loaded in the
            app.
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

export function IntegrationsSection({ isGuest }) {
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
            <LinkIcon
              className="h-5 w-5 text-content-muted"
              aria-hidden="true"
            />
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
          Steam Review
        </Button>
      </div>
    </section>
  );
}
