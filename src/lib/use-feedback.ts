"use client";

import { useCallback, useEffect, useState } from "react";
import { feedbackService } from "@/lib/firebase/services";
import type { FeedbackRecord } from "@/lib/feedback";

type FeedState = { loading: boolean; error: string | null; rows: FeedbackRecord[] };

/**
 * Live feed of clients/{clientId}/feedback for the authenticated admin's store.
 *
 * One onSnapshot listener on the store's own feedback subcollection: new
 * customer feedback appears immediately, and moderation/reply writes made
 * anywhere (Feedback page, Reviews page, another admin tab) are reflected
 * without a manual refresh. The path is always the admin's own clientId —
 * never "every client, filtered in the browser".
 */
export function useFeedbackFeed(clientId: string) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<FeedState>({ loading: true, error: null, rows: [] });

  useEffect(() => {
    let alive = true;
    const unsubscribe = feedbackService.watch(
      clientId,
      (rows) => {
        if (alive) setState({ loading: false, error: null, rows });
      },
      (message) => {
        if (alive) setState((s) => ({ loading: false, error: message, rows: s.rows }));
      },
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [clientId, tick]);

  /** Re-subscribe (used after an error and by Retry). */
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: s.rows.length === 0 }));
    setTick((t) => t + 1);
  }, []);

  return { ...state, reload };
}
