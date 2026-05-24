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

/**
 * The first day of the viewed week the plan is considered "active" for
 * the current goal. Items anchored to days BEFORE this index are not
 * rolled forward and not rendered as actionable - they pre-date the
 * goal.
 *
 *   - No goal yet                       → undefined (plan never active).
 *   - Viewed week BEFORE the goal week  → undefined (week pre-dates the
 *                                          goal, so nothing is active).
 *   - Viewed week === goal's week       → start at the goal's local day.
 *   - Viewed week AFTER the goal week   → start at Monday (entire week
 *                                          counts).
 */
export function planStartDay(
  goal: Pick<PlanGoalRow, 'createdAt'> | undefined,
  weekStart: string,
): PlanDay | undefined {
  if (!goal) return undefined;
  const goalDate = new Date(goal.createdAt);
  const goalWeek = weekStartIso(goalDate);
  if (goalWeek > weekStart) return undefined;
  if (goalWeek === weekStart) return localDayIndex(goalDate);
  return 0;
}

export interface UsePlanReturn {
  loading: boolean;
  goal: PlanGoalRow | undefined;
  archivedGoals: PlanGoalRow[];
  /** Local-timezone ISO of Monday for the *current* (real) week. */
  currentWeekStart: string;
  /** Local-timezone ISO of Monday for the week the user is *viewing*.
   *  Equals currentWeekStart until the user paginates with stepWeek. */
  weekStart: string;
  /** 0=Mon..6=Sun for the real local today. */
  today: PlanDay;
  /** True iff the viewed week === current week. */
  isCurrentWeek: boolean;
  /** True iff the viewed week is in the past. */
  isPastWeek: boolean;
  /** True iff the viewed week is in the future. */
  isFutureWeek: boolean;
  /** Map itemId → true if that item has been checked off in the
   *  *viewed* week. */
  completedIds: Set<string>;
  setGoal: (text: string) => Promise<void>;
  /** Toggle a check in the viewed week. No-op on future / pre-plan
   *  weeks; UI also disables the input there. */
  toggle: (itemId: string) => Promise<void>;
  /** Shift the viewed week by n weeks (positive = forward). */
  stepWeek: (n: number) => void;
  /** Reset the viewed week back to today's. */
  jumpToCurrentWeek: () => void;
}

export function usePlan(): UsePlanReturn {
  const [loading, setLoading] = useState(true);
  const [goal, setGoalState] = useState<PlanGoalRow | undefined>(undefined);
  const [archivedGoals, setArchivedGoals] = useState<PlanGoalRow[]>([]);
  const [checks, setChecks] = useState<PlanCheckRow[]>([]);
  const [viewWeekStart, setViewWeekStart] = useState<string>(() => weekStartIso(new Date()));

  const today = useMemo(() => localDayIndex(new Date()), []);
  const currentWeekStart = useMemo(() => weekStartIso(new Date()), []);

  const refresh = useCallback(async () => {
    const [g, archived, c] = await Promise.all([
      getActiveGoal(),
      listArchivedGoals(),
      getChecksForWeek(viewWeekStart),
    ]);
    setGoalState(g);
    setArchivedGoals(archived);
    setChecks(c);
    setLoading(false);
  }, [viewWeekStart]);

  useEffect(() => {
    void refresh();
    return subscribePlan(() => {
      void refresh();
    });
  }, [refresh]);

  // Roll the local clock so the next time the user opens the page on
  // Monday morning, the checklist visibly resets - without a refresh
  // listener like this, today/weekStart would stay stuck at their
  // initial mount values until a full reload.
  useEffect(() => {
    const id = window.setInterval(
      () => {
        const nowDay = localDayIndex(new Date());
        const nowWeek = weekStartIso(new Date());
        if (nowDay !== today || nowWeek !== currentWeekStart) {
          void refresh();
        }
      },
      // Five minutes - cheap, plenty for a one-user app to notice the
      // local day rolled over.
      5 * 60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [refresh, today, currentWeekStart]);

  const completedIds = useMemo(() => new Set(checks.map((c) => c.itemId)), [checks]);

  const setGoal = useCallback(async (text: string) => {
    await setGoalDb(text);
  }, []);

  const toggle = useCallback(
    async (itemId: string) => {
      // Past / future weeks are read-only - the UI disables the input
      // already, but guard at the action layer too so a stray keyboard
      // event can't write a check into a non-current week.
      if (viewWeekStart !== currentWeekStart) return;
      await toggleCheckDb(viewWeekStart, itemId);
    },
    [viewWeekStart, currentWeekStart],
  );

  const stepWeek = useCallback((n: number) => {
    setViewWeekStart((w) => {
      const d = new Date(w);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + n * 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }, []);

  const jumpToCurrentWeek = useCallback(() => {
    setViewWeekStart(currentWeekStart);
  }, [currentWeekStart]);

  const isCurrentWeek = viewWeekStart === currentWeekStart;
  const isPastWeek = viewWeekStart < currentWeekStart;
  const isFutureWeek = viewWeekStart > currentWeekStart;

  return {
    loading,
    goal,
    archivedGoals,
    currentWeekStart,
    weekStart: viewWeekStart,
    today,
    isCurrentWeek,
    isPastWeek,
    isFutureWeek,
    completedIds,
    setGoal,
    toggle,
    stepWeek,
    jumpToCurrentWeek,
  };
}

/** Items past their anchored day this week that are still unchecked AND
 *  inside the plan-active window. Rendered in today's column with a
 *  "(from Mon)" annotation. */
export function rolloverItems(
  today: PlanDay,
  completed: Set<string>,
  startDay: PlanDay | undefined,
) {
  if (startDay === undefined) return [];
  return WEEKLY_PLAN.filter(
    (i) => i.day >= startDay && i.day < today && !completed.has(i.id),
  );
}
