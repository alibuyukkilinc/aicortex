import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public hint?: unknown,
  ) {
    super(message);
  }
}

// Cookie auth + the CSRF header the server requires on writes.
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: {
      "x-cortex-csrf": "1",
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; hint?: unknown } }).error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? res.statusText, e.hint);
  }
  return data as T;
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
};

// Bumped whenever the server reports a change; every useApi refetches.
export const LiveContext = createContext(0);

export function useApi<T>(path: string | null) {
  const live = useContext(LiveContext);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const first = useRef(true);

  // Declared before the fetch effect so a new path shows the spinner again.
  useEffect(() => {
    first.current = true;
  }, [path]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    // Only show a spinner on the first load; live refreshes swap data in place.
    if (first.current) setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(e))
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          first.current = false;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, live, nonce]);

  return { data, error, loading, reload };
}
