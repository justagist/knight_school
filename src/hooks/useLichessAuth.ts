import { useEffect, useState } from 'react';
import { getLichessAuth } from '../db/lichessAuth';
import type { LichessAuthRow } from '../db/db';

interface UseLichessAuthReturn {
  auth: LichessAuthRow | undefined;
  hasToken: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Reactive accessor for the singleton Lichess token row. Used by the
 * Openings tab + AnalyzeView to decide whether to call the Explorer at
 * all, and by the inline opening header to show a "set a token to unlock
 * master stats" CTA when ECO has the name but not the deeper data.
 *
 * Listens on a custom `ks-lichess-auth-changed` window event so other
 * surfaces (Settings) can broadcast updates without a global store.
 */
export function useLichessAuth(): UseLichessAuthReturn {
  const [auth, setAuth] = useState<LichessAuthRow | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const row = await getLichessAuth();
    setAuth(row);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener('ks-lichess-auth-changed', handler);
    return () => window.removeEventListener('ks-lichess-auth-changed', handler);
  }, []);

  return { auth, hasToken: !!auth?.token, loading, refresh };
}

/** Fire from Settings after add/edit/remove so other surfaces re-read state. */
export function notifyLichessAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('ks-lichess-auth-changed'));
  }
}
