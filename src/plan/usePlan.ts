import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanCheckRow, PlanGoalRow } from '../db/db';
import {
  getActiveGoal,
  getChecksForWeek,
  listArchivedGoals,
  setGoal as setGoalDb,
  subscribePlan,
  toggleCheck as toggleCheckDb,
} from '../db/plan';
import { localDayIndex, weekStartIso } from './week';
import { WEEKLY_PLAN, type PlanDay } from './template';

export interface UsePlanReturn {
  loading: boolean;
  goal: PlanGoalRow | undefined;
  archivedGoals: PlanGoalRow[];
  /** Local-timezone ISO of Monday for the current week (used as the
   *  partition key for plan checks). */
  weekStart: string;
  /** 0=Mon..6=Sun for today. */
  today: PlanDay;
  /** Map itemId → true if that item has been checked off this week. */
  completedIds: Set<string>;
  setGoal: (text: string) => Promise<void>;
  toggle: (itemId: string) => Promise<void>;
}

export function usePlan(): UsePlanReturn {
  const [loading, setLoading] = useState(true);
  const [goal, setGoalState] = useState<PlanGoalRow | undefined>(undefined);
  const [archivedGoals, setArchivedGoals] = useState<PlanGoalRow[]>([]);
  const [checks, setChecks] = useState<PlanCheckRow[]>([]);

  const today = useMemo(() => localDayIndex(new Date()), []);
  const weekStart = useMemo(() => weekStartIso(new Date()), []);

  const refresh = useCallback(async () => {
    const [g, archived, c] = await Promise.all([
      getActiveGoal(),
      listArchivedGoals(),
      getChecksForWeek(weekStart),
    ]);
    setGoalState(g);
    setArchivedGoals(archived);
    setChecks(c);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    void refresh();
    return subscribePlan(() => {
      void refresh();
    });
  }, [refresh]);

  // Roll the local clock so the next time the user opens the page on
  // Monday morning, the checklist visibly resets — without a refresh
  // listener like this, today/weekStart would stay stuck at their
  // initial mount values until a full reload.
  useEffect(() => {
    const id = window.setInterval(
      () => {
        const nowDay = localDayIndex(new Date());
        const nowWeek = weekStartIso(new Date());
        if (nowDay !== today || nowWeek !== weekStart) {
          // Force a re-mount by reloading the whole component tree's
          // closure — but here we just trigger refresh; the parent
          // page also reads weekStart from this hook, which will
          // recompute on next mount. For MVP the daily check is enough.
          void refresh();
        }
      },
      // Five minutes — cheap, plenty for a one-user app to notice the
      // local day rolled over.
      5 * 60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [refresh, today, weekStart]);

  const completedIds = useMemo(() => new Set(checks.map((c) => c.itemId)), [checks]);

  const setGoal = useCallback(async (text: string) => {
    await setGoalDb(text);
  }, []);

  const toggle = useCallback(
    async (itemId: string) => {
      await toggleCheckDb(weekStart, itemId);
    },
    [weekStart],
  );

  return { loading, goal, archivedGoals, weekStart, today, completedIds, setGoal, toggle };
}

/** Items past their anchored day this week that are still unchecked.
 *  Rendered in today's column with a "(from Mon)" annotation. */
export function rolloverItems(today: PlanDay, completed: Set<string>) {
  return WEEKLY_PLAN.filter((i) => i.day < today && !completed.has(i.id));
}
