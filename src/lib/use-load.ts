"use client";

import { useCallback, useEffect, useState } from "react";
import { fireErrorMessage } from "@/lib/firebase/firestore";

/**
 * Client-side data loader with explicit loading / error / data states and a
 * reload trigger. No synchronous setState inside effects.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], enabled = true) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: T | null }>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fn()
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (alive) setState((s) => ({ loading: false, error: fireErrorMessage(err), data: s.data }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, enabled, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Wraps a mutation: toast on success/failure, then reload. */
export function runOp(
  op: () => Promise<unknown>,
  onDone: (ok: boolean, message: string) => void,
  successMessage: string,
) {
  op()
    .then(() => onDone(true, successMessage))
    .catch((err) => onDone(false, fireErrorMessage(err)));
}
