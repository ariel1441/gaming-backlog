import { useCallback, useEffect, useRef, useState } from "react";
import { Button, useConfirm, useToast } from "../../components/ui";
import { listWishlist, syncWishlist } from "../../services/wishlistService";
import { syncSteamLibrary } from "../../services/steamService";
import { invalidateWishlistCache } from "../../services/wishlistCache";
import { useSteamExperience } from "./SteamExperienceContext";
import SteamSyncStatus from "./SteamSyncStatus";

export default function SteamSyncSettings() {
  const health = useSteamExperience();
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const action = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();
  const read = useCallback(async (signal) => {
    try {
      const result = await listWishlist({ limit: 1 }, { signal });
      if (!signal?.aborted) {
        setSaved(result);
        setError("");
      }
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal);
    return () => controller.abort();
  }, [
    read,
    health.account?.id,
    health.account?.priceRevision,
    health.account?.lastWishlistSyncAt,
  ]);
  useEffect(() => {
    setBusy(false);
    return () => action.current?.abort();
  }, [health.account?.id]);
  const run = async (kind, confirmEmpty = false) => {
    if (action.current && !action.current.signal.aborted) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy(true);
    try {
      const result =
        kind === "library"
          ? await syncSteamLibrary({ signal: controller.signal })
          : await syncWishlist({
              prices: kind === "prices",
              confirmEmpty,
              signal: controller.signal,
              onJob: () => void health.reload(),
            });
      if (controller.signal.aborted) return;
      if (
        ["partial", "failed"].includes(result.run?.status) ||
        result.needsEmptyConfirmation
      )
        toast.warning(
          "Update finished with items needing attention. See the saved results below.",
        );
      else toast.success("Steam check finished.");
    } catch (err) {
      if (!controller.signal.aborted) toast.error(err.message);
    } finally {
      if (!controller.signal.aborted) {
        action.current = null;
        setBusy(false);
        invalidateWishlistCache();
        await Promise.all([health.reload(), read(controller.signal)]);
      }
    }
  };
  return (
    <div className="mt-5">
      {error ? (
        <div className="mb-3">
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
          <Button size="sm" onClick={() => read()}>
            Retry saved coverage
          </Button>
        </div>
      ) : null}
      <SteamSyncStatus
        diagnostics
        savedAccount={saved?.account}
        priceHealth={saved?.priceHealth}
        busy={busy}
        onLibraryRefresh={() => run("library")}
        onMembershipRefresh={() => run("wishlist")}
        onPriceRefresh={() => run("prices")}
        confirmEmpty={async () => {
          if (
            await confirm({
              title: "Confirm an empty Steam wishlist?",
              message:
                "Fetch Steam again. Saved Steam membership is removed only if the empty response is confirmed. Local Wishlist intentions are preserved.",
              confirmLabel: "Check again",
            })
          )
            await run("wishlist", true);
        }}
      />
    </div>
  );
}
