import { db, type DrillSessionRow } from './db';
import { uuid } from '../lib/uuid';

export type NewDrillSession = Omit<
  DrillSessionRow,
  'id' | 'createdAt' | 'attempts' | 'successes' | 'lastResult' | 'lastDrilledAt'
> & {
  attempts?: number;
  successes?: number;
};

/**
 * Create + persist a new saved drill session row. Used by the setup
 * modal's "Add to queue" button to stash a config the user wants to
 * come back to later.
 */
export async function addDrillSession(input: NewDrillSession): Promise<DrillSessionRow> {
  const row: DrillSessionRow = {
    id: uuid(),
    studyId: input.studyId,
    studyName: input.studyName,
    scope: input.scope,
    mode: input.mode,
    side: input.side,
    length: input.length,
    chapterIndices: [...input.chapterIndices],
    attempts: input.attempts ?? 0,
    successes: input.successes ?? 0,
    createdAt: Date.now(),
    label: input.label,
  };
  await db().drillSessions.put(row);
  window.dispatchEvent(new Event('ks-drills-changed'));
  return row;
}

export async function listDrillSessions(): Promise<DrillSessionRow[]> {
  return db().drillSessions.orderBy('createdAt').reverse().toArray();
}

export async function listDrillSessionsForStudy(studyId: string): Promise<DrillSessionRow[]> {
  return db().drillSessions.where('studyId').equals(studyId).toArray();
}

export async function getDrillSession(id: string): Promise<DrillSessionRow | undefined> {
  return db().drillSessions.get(id);
}

export async function deleteDrillSession(id: string): Promise<void> {
  await db().drillSessions.delete(id);
  window.dispatchEvent(new Event('ks-drills-changed'));
}

/**
 * Cascade — call when a study is removed so the queue stops surfacing
 * sessions whose study no longer exists.
 */
export async function deleteSessionsForStudy(studyId: string): Promise<void> {
  await db().drillSessions.where('studyId').equals(studyId).delete();
}

/**
 * Record the outcome of an attempt against this session. Called by the
 * mixed-drill view on completion.
 */
export async function recordSessionAttempt(
  id: string,
  result: 'pass' | 'fail',
): Promise<void> {
  const row = await db().drillSessions.get(id);
  if (!row) return;
  await db().drillSessions.put({
    ...row,
    attempts: row.attempts + 1,
    successes: row.successes + (result === 'pass' ? 1 : 0),
    lastResult: result,
    lastDrilledAt: Date.now(),
  });
  window.dispatchEvent(new Event('ks-drills-changed'));
}
