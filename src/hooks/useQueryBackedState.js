import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

function readStorage(key) {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // URL state remains authoritative when storage is unavailable.
  }
}

export default function useQueryBackedState({
  key,
  defaultValue,
  parse,
  serialize,
  storageKey,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlValue = searchParams.get(key);
  const parseValue = (raw) =>
    parse ? parse(raw, defaultValue) : (raw ?? defaultValue);
  const serializeValue = (next) =>
    serialize ? serialize(next) : String(next);
  const [value, setValue] = useState(() =>
    parseValue(urlValue ?? readStorage(storageKey)),
  );
  const previousUrlValue = useRef(urlValue);
  const syncingFromUrl = useRef(false);

  useEffect(() => {
    if (urlValue === previousUrlValue.current) return;
    previousUrlValue.current = urlValue;
    syncingFromUrl.current = true;
    setValue(parseValue(urlValue));
  }, [urlValue]);

  useEffect(() => {
    const encoded = serializeValue(value);
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      writeStorage(storageKey, encoded);
      return;
    }
    setSearchParams(
      (current) => {
        if (current.get(key) === encoded) return current;
        const next = new URLSearchParams(current);
        next.set(key, encoded);
        return next;
      },
      { replace: true },
    );
    writeStorage(storageKey, encoded);
  }, [key, setSearchParams, storageKey, value]);

  return [value, setValue];
}
