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

/** ms epoch helper — surfaces the "x days ago" label without forcing callers to compute. */
export function studyAgeDays(row: Pick<StudyRow, 'importedAt'>): number {
  return Math.max(0, Math.floor((Date.now() - row.importedAt) / 86_400_000));
}
