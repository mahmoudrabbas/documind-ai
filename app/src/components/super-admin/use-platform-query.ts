"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Parameterised sibling of usePlatformData.
 *
 * Refetches are keyed off a serialised param object rather than the loader's
 * identity, so an inline arrow loader is safe (usePlatformData would loop).
 * Previous data stays visible during refetch so paging does not flash.
 */
export function usePlatformQuery<TParams, TData>(
  loader: (params: TParams, signal?: AbortSignal) => Promise<{ data: TData }>,
  params: TParams,
) {
  const key = JSON.stringify(params);
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loaderRef = useRef(loader);
  const paramsRef = useRef(params);
  const hasData = useRef(false);

  // Post-commit ref sync (react-hooks/refs); must precede the [key, run]
  // effect so refetches observe the latest loader/params.
  useEffect(() => {
    loaderRef.current = loader;
    paramsRef.current = params;
  });

  const run = useCallback(async (signal?: AbortSignal) => {
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await loaderRef.current(paramsRef.current, signal);
      if (signal?.aborted) return;
      setData(response.data);
      hasData.current = true;
    } catch {
      if (!signal?.aborted)
        setError("Unable to load platform data. Please try again.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void run(controller.signal);
    return () => controller.abort();
  }, [key, run]);

  return { data, loading, refreshing, error, reload: () => run() };
}
