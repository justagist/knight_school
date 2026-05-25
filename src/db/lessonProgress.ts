import { db, type LessonProgressRow } from './db';

const LESSON_PROGRESS_EVENT = 'ks-lesson-progress-changed';

function notify(): void {
  window.dispatchEvent(new Event(LESSON_PROGRESS_EVENT));
}

export function subscribeLessonProgress(listener: () => void): () => void {
  window.addEventListener(LESSON_PROGRESS_EVENT, listener);
  return () => window.removeEventListener(LESSON_PROGRESS_EVENT, listener);
}

export function lessonProgressId(studyId: string, chapterIndex: number): string {
  return `${studyId}::${chapterIndex}`;
}

interface RecordArgs {
  studyId: string;
  chapterIndex: number;
  studyName: string;
  chapterTitle: string;
  currentPly: number;
  totalPlies: number;
}

/**
 * Upsert a lesson resume marker. Self-pruning: when the user is at the
 * chapter start (ply 0) or finished the chapter (ply === totalPlies),
 * the row is deleted instead of written. The queue only ever holds
 * partial reads.
 *
 * Idempotent under rapid ply changes - a single rw transaction keyed
 * on the composite id.
 */
export async function recordLessonProgress(args: RecordArgs): Promise<void> {
  const id = lessonProgressId(args.studyId, args.chapterIndex);
  const completed = args.totalPlies > 0 && args.currentPly >= args.totalPlies;
  const fresh = args.currentPly <= 0;
  await db().transaction('rw', db().lessonProgress, async () => {
    if (completed || fresh) {
      await db().lessonProgress.delete(id);
      return;
    }
    await db().lessonProgress.put({
      id,
      studyId: args.studyId,
      chapterIndex: args.chapterIndex,
      studyName: args.studyName,
      chapterTitle: args.chapterTitle,
      currentPly: args.currentPly,
      totalPlies: args.totalPlies,
      lastViewedAt: Date.now(),
    });
  });
  notify();
}

/** Newest-first by lastViewedAt. */
export async function listLessonProgress(): Promise<LessonProgressRow[]> {
  return db().lessonProgress.orderBy('lastViewedAt').reverse().toArray();
}

export async function deleteLessonProgress(id: string): Promise<void> {
  await db().lessonProgress.delete(id);
  notify();
}

export async function clearLessonProgress(): Promise<void> {
  await db().lessonProgress.clear();
  notify();
}

/** Wipes every progress row for a study - called when the study is
 *  removed (so resume rows for a deleted study don't dangle). */
export async function deleteLessonProgressForStudy(studyId: string): Promise<void> {
  await db().lessonProgress.where('studyId').equals(studyId).delete();
  notify();
}
