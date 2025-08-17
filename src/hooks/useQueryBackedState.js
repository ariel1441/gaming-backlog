import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
/**
 * Persist a piece of state into URLSearchParams (and optional localStorage).
 * @param {object} opts
 * @param {string} opts.key
 * @param {any} opts.defaultValue
 * @param {(raw:any, def:any)=>any} [opts.parse]
 * @param {(val:any)=>string} [opts.serialize]
 * @param {string} [opts.storageKey]
 */
export default function useQueryBackedState({
  key,
  defaultValue,
  parse,
  serialize,
  storageKey,
}) {
  const [sp, setSp] = useSearchParams();
  const raw =
    sp.get(key) ?? (storageKey ? localStorage.getItem(storageKey) : null);
  const initial = parse ? parse(raw, defaultValue) : (raw ?? defaultValue);

  const [value, setValue] = useState(initial);

  useEffect(() => {
    const next = new URLSearchParams(sp);
    next.set(key, serialize ? serialize(value) : String(value));
    setSp(next, { replace: true });
    if (storageKey) localStorage.setItem(storageKey, String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue];
}
