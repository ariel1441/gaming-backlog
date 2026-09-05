import { useCallback, useEffect, useRef, useState } from "react";
import { listAllWishlist } from "../../services/wishlistService";

const empty = {
  items: [],
  total: 0,
  account: null,
  metadata: {},
  loading: false,
  error: "",
};

export default function useWishlist({
  userId,
  enabled = true,
  membership = "active",
}) {
  const [state, setState] = useState(empty);
  const request = useRef(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const current = ++sequence.current;
    if (!enabled || !userId) {
      setState(empty);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState((value) => ({ ...value, loading: true, error: "" }));
    try {
      const payload = await listAllWishlist(
        { active: membership, sort: "provider_order" },
        { signal: controller.signal },
      );
      if (current === sequence.current)
        setState({ ...payload, loading: false, error: "" });
    } catch (error) {
      if (current === sequence.current && error.name !== "AbortError") {
        setState((value) => ({
          ...value,
          loading: false,
          error: error.message || "Could not load Wishlist.",
        }));
      }
    }
  }, [enabled, membership, userId]);
  useEffect(() => {
    setState(empty);
    void refresh();
    return () => {
      sequence.current++;
      request.current?.abort();
    };
  }, [refresh]);
  return { ...state, refresh };
}
