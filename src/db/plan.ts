import { db, type PlanCheckRow, type PlanGoalRow } from './db';
import { uuid } from '../lib/uuid';
import { parseTargetDate } from '../plan/week';

const PLAN_EVENT = 'ks-plan-changed';

function notify(): void {
  window.dispatchEvent(new Event(PLAN_EVENT));
}

export function subscribePlan(listener: () => void): () => void {
  window.addEventListener(PLAN_EVENT, listener);
  return () => window.removeEventListener(PLAN_EVENT, listener);
}

/** Active = newest non-archived row. The user only sees one at a time. */
export async function getActiveGoal(): Promise<PlanGoalRow | undefined> {
  const rows = await db().planGoals.orderBy('createdAt').reverse().toArray();
  return rows.find((r) => !r.archived);
}

/** All archived goals, newest-first — used by the goal-history view. */
export async function listArchivedGoals(): Promise<PlanGoalRow[]> {
  const rows = await db().planGoals.orderBy('createdAt').reverse().toArray();
  return rows.filter((r) => r.archived);
}

/**
 * Replace the active goal. The previous active goal (if any) is moved
 * to archived rather than deleted so the user can scroll their history
 * later.
 */
export async function setGoal(goalText: string): Promise<PlanGoalRow> {
  const trimmed = goalText.trim();
  if (!trimmed) throw new Error('Goal cannot be empty.');
  const row: PlanGoalRow = {
    id: uuid(),
    goalText: trimmed,
    createdAt: Date.now(),
    targetDate: parseTargetDate(trimmed),
    archived: false,
  };
  await db().transaction('rw', db().planGoals, async () => {
    const existing = await db().planGoals.orderBy('createdAt').reverse().toArray();
    for (const r of existing) {
      if (!r.archived) await db().planGoals.update(r.id, { archived: true });
    }
    await db().planGoals.add(row);
  });
  notify();
  return row;
}

export async function deleteGoal(id: string): Promise<void> {
  await db().planGoals.delete(id);
  notify();
}

export async function getChecksForWeek(weekStart: string): Promise<PlanCheckRow[]> {
  return db().planChecks.where('weekStart').equals(weekStart).toArray();
}

/** Toggle the (weekStart, itemId) check. Inserts when missing, deletes
 *  when present. Atomic via a single rw transaction so a concurrent
 *  toggle from another tab can't produce two rows for the same pair. */
export async function toggleCheck(weekStart: string, itemId: string): Promise<void> {
  await db().transaction('rw', db().planChecks, async () => {
    const existing = await db()
      .planChecks.where('[weekStart+itemId]')
      .equals([weekStart, itemId])
      .first();
    if (existing) {
      await db().planChecks.delete(existing.id);
    } else {
      await db().planChecks.add({
        id: uuid(),
        weekStart,
        itemId,
        completedAt: Date.now(),
      });
    }
  });
  notify();
}
