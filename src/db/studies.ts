import { db, type StudyRow } from './db';

/** All saved studies, newest-imported first. */
export async function listStudies(): Promise<StudyRow[]> {
  const rows = await db().studies.orderBy('importedAt').reverse().toArray();
  return rows;
}

export async function getStudy(id: string): Promise<StudyRow | undefined> {
  return db().studies.get(id);
}

export async function putStudy(row: StudyRow): Promise<void> {
  await db().studies.put(row);
}

export async function deleteStudy(id: string): Promise<void> {
  await db().studies.delete(id);
}

/**
 * Remove a study + every row that hangs off it (drill lines, attempts,
 * position pool, saved sessions) inside one Dexie rw transaction so a
 * crash mid-cascade can't leave orphan rows pointing at a deleted
 * study.
 */
export async function removeStudyCascade(id: string): Promise<void> {
  const d = db();
  await d.transaction(
    'rw',
    [d.studies, d.drillLines, d.drillAttempts, d.drillPositions, d.drillSessions],
    async () => {
      const lines = await d.drillLines.where('studyId').equals(id).toArray();
      const lineIds = lines.map((l) => l.id);
      await d.drillLines.where('studyId').equals(id).delete();
      if (lineIds.length > 0) {
        await d.drillAttempts.where('drillLineId').anyOf(lineIds).delete();
      }
      await d.drillPositions.where('studyId').equals(id).delete();
      await d.drillSessions.where('studyId').equals(id).delete();
      await d.studies.delete(id);
    },
  );
  window.dispatchEvent(new Event('ks-studies-changed'));
  window.dispatchEvent(new Event('ks-drills-changed'));
}

/** ms epoch helper - surfaces the "x days ago" label without forcing callers to compute. */
export function studyAgeDays(row: Pick<StudyRow, 'importedAt'>): number {
  return Math.max(0, Math.floor((Date.now() - row.importedAt) / 86_400_000));
}
