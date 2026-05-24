import { Chess } from 'chess.js';
import { db, type DrillAttemptRow, type DrillLineRow, type StudyRow } from './db';
import { parsePgn } from '../lib/pgn';

/** Stable composite id for a (study, chapter, side) drill line. */
export function drillLineId(
  studyId: string,
  chapterIndex: number,
  userSide: 'white' | 'black',
): string {
  return `${studyId}::${chapterIndex}::${userSide}`;
}

/**
 * Build (or refresh) a DrillLineRow from a study chapter. We re-parse the
 * chapter PGN so the chapter row in DB stays the only PGN source-of-truth —
 * if the chapter is refreshed (re-imported) the drill line will pick up the
 * new moves on the next `ensureDrillLine` call. Stats are preserved across
 * refreshes (same id).
 */
export async function ensureDrillLine(
  study: StudyRow,
  chapterIndex: number,
  userSide: 'white' | 'black',
): Promise<DrillLineRow> {
  const chapter = study.chapters[chapterIndex];
  if (!chapter) throw new Error(`Chapter ${chapterIndex} not found in study ${study.id}.`);
  const id = drillLineId(study.id, chapterIndex, userSide);
  const existing = await db().drillLines.get(id);

  const parsed = parsePgn(chapter.pgn);
  const uciMoves = parsed.moves.map((m) => `${m.from}${m.to}`);

  const row: DrillLineRow = {
    id,
    studyId: study.id,
    chapterIndex,
    studyName: study.name,
    chapterTitle: chapter.title,
    userSide,
    startingFen: parsed.startingFen,
    uciMoves,
    sanMoves: parsed.moves.map((m) => m.san),
    comments: parsed.comments,
    // Preserve cumulative stats if the row already exists; otherwise zero.
    attempts: existing?.attempts ?? 0,
    successes: existing?.successes ?? 0,
    lastResult: existing?.lastResult,
    lastDrilledAt: existing?.lastDrilledAt,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await db().drillLines.put(row);
  window.dispatchEvent(new Event('ks-drills-changed'));
  return row;
}

export async function getDrillLine(id: string): Promise<DrillLineRow | undefined> {
  return db().drillLines.get(id);
}

export async function listDrillLines(): Promise<DrillLineRow[]> {
  return db().drillLines.toArray();
}

export async function listDrillLinesForStudy(studyId: string): Promise<DrillLineRow[]> {
  return db().drillLines.where('studyId').equals(studyId).toArray();
}

export async function deleteDrillLine(id: string): Promise<void> {
  await db().drillLines.delete(id);
  await db().drillAttempts.where('drillLineId').equals(id).delete();
}

/** Wipes every drill line for a study — called when the study is removed. */
export async function deleteDrillLinesForStudy(studyId: string): Promise<void> {
  const rows = await db().drillLines.where('studyId').equals(studyId).toArray();
  for (const r of rows) await deleteDrillLine(r.id);
}

/**
 * Save the outcome of a drill attempt. Updates the line's cumulative stats
 * (unless the attempt was invalidated by chat usage — those are logged but
 * never tallied).
 */
export async function recordDrillAttempt(attempt: DrillAttemptRow): Promise<void> {
  await db().drillAttempts.put(attempt);
  // Mixed / spot attempts don't have a drillLineId — they aggregate across
  // chapters. Their stats land in the attempts table only; per-line stats
  // stay untouched.
  if (!attempt.invalidated && attempt.result && attempt.drillLineId) {
    const line = await db().drillLines.get(attempt.drillLineId);
    if (line) {
      await db().drillLines.put({
        ...line,
        attempts: line.attempts + 1,
        successes: line.successes + (attempt.result === 'pass' ? 1 : 0),
        lastResult: attempt.result,
        lastDrilledAt: attempt.endedAt ?? Date.now(),
      });
    }
  }
  // Notify regardless (the queue may want to re-render even for invalidated
  // attempts — e.g. drop the "in progress" marker).
  window.dispatchEvent(new Event('ks-drills-changed'));
}

/** Most recent attempts for a single line, newest-first. */
export async function listDrillAttempts(
  drillLineId: string,
  limit = 20,
): Promise<DrillAttemptRow[]> {
  return db()
    .drillAttempts.where('drillLineId')
    .equals(drillLineId)
    .reverse()
    .sortBy('startedAt')
    .then((rows) => rows.slice(0, limit));
}

/**
 * Convenience: side-to-move at a given ply, derived from the line's
 * starting FEN + an internal replay. Standard starts let the caller infer
 * from ply parity, but FEN-tagged chapters can start mid-game where parity
 * alone isn't enough.
 */
export function sideToMoveAtPly(line: DrillLineRow, ply: number): 'w' | 'b' {
  const chess = new Chess(line.startingFen);
  for (let i = 0; i < ply && i < line.uciMoves.length; i++) {
    const u = line.uciMoves[i];
    chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u.slice(4, 5) : undefined });
  }
  return chess.turn();
}

export function isUserTurn(line: DrillLineRow, ply: number): boolean {
  const stm = sideToMoveAtPly(line, ply);
  return stm === (line.userSide === 'white' ? 'w' : 'b');
}

/** FEN at a given ply (replays from start). Useful for board display + engine eval. */
export function fenAtPly(line: DrillLineRow, ply: number): string {
  const chess = new Chess(line.startingFen);
  for (let i = 0; i < ply && i < line.uciMoves.length; i++) {
    const u = line.uciMoves[i];
    chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u.slice(4, 5) : undefined });
  }
  return chess.fen();
}
