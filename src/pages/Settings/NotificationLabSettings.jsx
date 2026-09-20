import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Badge, Button, SelectMenu, useConfirm, useToast } from "../../components/ui";
import {
  resetNotificationLab,
  seedNotificationLab,
} from "../../services/notificationLabService";

const scenarios = [
  { value: "all", label: "All notification types" },
  { value: "new-game", label: "New owned game" },
  { value: "started-playing", label: "Started playing outside Backlog" },
  { value: "existing-game", label: "Existing Backlog game playing" },
  { value: "unmatched", label: "Unmatched Steam game" },
  { value: "price-drop", label: "Price drop (not a sale)" },
  { value: "sale-started", label: "Sale started + price drop" },
  { value: "sale-ended", label: "Sale ended + price increase" },
  { value: "wishlist-update", label: "Wishlist update / long title" },
  { value: "wishlist-removed", label: "Removed from Wishlist" },
  { value: "purchase-pair", label: "New game + Wishlist purchase pairing" },
  { value: "wishlist-priority", label: "Wishlist order summary" },
];

export function NotificationLabSettings({ isGuest }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [scenario, setScenario] = useState("all");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const labEnabled =
    import.meta.env.DEV && import.meta.env.VITE_NOTIFICATION_LAB_ENABLED === "true";
  if (!labEnabled || isGuest) return null;

  const seed = async () => {
    try {
      setBusy(true);
      const payload = await seedNotificationLab(scenario);
      const names = payload?.seeded?.length || 0;
      setResult(`${names} lab ${names === 1 ? "scenario" : "scenarios"} ready. Reload to refresh the notification bell.`);
      toast.success("Notification Lab fixtures created.");
    } catch (error) {
      toast.error(error?.message || "Could not create Notification Lab fixtures.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const approved = await confirm({
      title: "Reset Notification Lab?",
      message: "This removes only Notification Lab fixtures, including any Backlog games added from them.",
      confirmLabel: "Reset lab",
      tone: "danger",
    });
    if (!approved) return;
    try {
      setBusy(true);
      const payload = await resetNotificationLab();
      setResult(`Lab reset${payload?.removedGames ? `; removed ${payload.removedGames} lab Backlog game${payload.removedGames === 1 ? "" : "s"}` : ""}. Reload to refresh the notification bell.`);
      toast.success("Notification Lab reset.");
    } catch (error) {
      toast.error(error?.message || "Could not reset Notification Lab.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-state-warning/35 bg-surface-card p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FlaskConical className="h-5 w-5 text-state-warning" aria-hidden="true" />
            Notification Lab
          </h2>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Local development only. Creates real, resettable inbox fixtures without Steam or metadata providers.
          </p>
        </div>
        <Badge variant="warning">Local only</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <label htmlFor="notification-lab-scenario" className="mb-1.5 block text-sm font-medium text-content-secondary">
            Demo scenario
          </label>
          <SelectMenu
            id="notification-lab-scenario"
            aria-label="Notification Lab scenario"
            value={scenario}
            onChange={setScenario}
            options={scenarios}
            disabled={busy}
          />
        </div>
        <Button type="button" variant="primary" onClick={seed} disabled={busy}>
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {busy ? "Preparing..." : "Create demo"}
        </Button>
        <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset lab
        </Button>
      </div>
      {result ? <p role="status" className="mt-3 text-sm text-content-muted">{result}</p> : null}
    </section>
  );
}
