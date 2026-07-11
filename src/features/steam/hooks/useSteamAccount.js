import { useCallback, useEffect, useRef, useState } from "react";
import { getSteamAccount } from "../../../services/steamService";

export function useSteamAccount({ enabled = true, onError } = {}) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const payload = await getSteamAccount();
      const nextAccount = payload?.account || null;
      setAccount(nextAccount);
      return nextAccount;
    } catch (error) {
      onErrorRef.current?.(error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { account, setAccount, loading, reload };
}
