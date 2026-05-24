import { useCallback, useEffect, useState } from 'react';
import type { GameHistoryRow } from '../db/db';
import {
  clearGameHistory,
  deleteGameHistory,
  listGameHistory,
  subscribeGameHistory,
} from '../db/gameHistory';

export interface UseGameHistoryReturn {
  loading: boolean;
  rows: GameHistoryRow[];
  remove: (gameKey: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

/**
 * Reactive view of the Analyze recent-games list. Refreshes on the
 * `ks-history-changed` window event so every mutation path (record on
 * load, single delete, clear-all) propagates without prop drilling.
 */
export function useGameHistory(): UseGameHistoryReturn {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<GameHistoryRow[]>([]);

  const refresh = useCallback(async () => {
    setRows(await listGameHistory());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeGameHistory(() => {
      void refresh();
    });
  }, [refresh]);

  const remove = useCallback(async (gameKey: string) => {
    await deleteGameHistory(gameKey);
  }, []);

  const clearAll = useCallback(async () => {
    await clearGameHistory();
  }, []);

  return { loading, rows, remove, clearAll };
}
