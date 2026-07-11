import { useCallback, useState } from "react";
import { useToast } from "../../../components/ui";
import { syncSteamLibrary } from "../../../services/steamService";
import {
  formatSteamLibrarySyncMessage,
  saveLastSteamSyncReview,
} from "../../../utils/steamSync";

export function useSteamSync({
  onAccount,
  onReview,
  onComplete,
  onError,
} = {}) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      toast.info(
        "Steam sync started. I will show review actions when it finishes.",
      );
      const payload = await syncSteamLibrary();
      const message = formatSteamLibrarySyncMessage(payload);

      if (payload?.skipped) toast.info(message);
      else if (payload?.private) toast.warning(message);
      else toast.success(message);

      let storedReview;
      if (payload?.syncReview?.total) {
        storedReview = saveLastSteamSyncReview(payload.syncReview);
      } else if (!payload?.skipped && !payload?.private) {
        storedReview = saveLastSteamSyncReview(null);
      }

      if (payload?.account) onAccount?.(payload.account);
      if (storedReview !== undefined) onReview?.(storedReview, payload);
      await onComplete?.(payload);
      return payload;
    } catch (error) {
      onError?.(error);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [onAccount, onComplete, onError, onReview, toast]);

  return { syncing, sync };
}
