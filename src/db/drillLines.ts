import { Chess } from 'chess.js';
import { db, type DrillAttemptRow, type DrillLineRow, type StudyRow } from './db';
import { parsePgn } from '../lib/pgn';
import { moveToUci } from '../lib/moveToUci';

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
 * chapter PGN so the chapter row in DB stays the only PGN source-of-truth -
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
  const uciMoves = parsed.moves.map(moveToUci);

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
  // Single rw transaction so a crash between the two deletes can't
  // leave attempts pointing at a row that no longer exists.
  await db().transaction('rw', db().drillLines, db().drillAttempts, async () => {
    await db().drillLines.delete(id);
    await db().drillAttempts.where('drillLineId').equals(id).delete();
  });
  window.dispatchEvent(new Event('ks-drills-changed'));
}

/** Wipes every drill line for a study - called when the study is removed. */
export async function deleteDrillLinesForStudy(studyId: string): Promise<void> {
  await db().transaction('rw', db().drillLines, db().drillAttempts, async () => {
    const lines = await db().drillLines.where('studyId').equals(studyId).toArray();
    const ids = lines.map((l) => l.id);
    if (ids.length === 0) return;
    await db().drillLines.where('studyId').equals(studyId).delete();
    await db().drillAttempts.where('drillLineId').anyOf(ids).delete();
  });
  window.dispatchEvent(new Event('ks-drills-changed'));
}

/**
 * Save the outcome of a drill attempt. Updates the line's cumulative stats
 * (unless the attempt was invalidated by chat usage - those are logged but
 * never tallied).
 */
export async function recordDrillAttempt(attempt: DrillAttemptRow): Promise<void> {
  // One Dexie rw tx + atomic `modify()` so two completions in different
  // tabs can't drop an increment. The previous read-then-put pattern was
  // an interleaved-write race: both tabs read attempts=5, both wrote 6.
  await db().transaction('rw', db().drillAttempts, db().drillLines, async () => {
    await db().drillAttempts.put(attempt);
    if (!attempt.invalidated && attempt.result && attempt.drillLineId) {
      const passInc = attempt.result === 'pass' ? 1 : 0;
      const endedAt = attempt.endedAt ?? Date.now();
      const finalResult = attempt.result;
      await db()
        .drillLines.where('id')
        .equals(attempt.drillLineId)
        .modify((line) => {
          line.attempts = (line.attempts ?? 0) + 1;
          line.successes = (line.successes ?? 0) + passInc;
          line.lastResult = finalResult;
          line.lastDrilledAt = endedAt;
        });
    }
  });
  // Notify regardless (the queue may want to re-render even for invalidated
  // attempts - e.g. drop the "in progress" marker).
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
  return replayThroughPly(line, ply).turn();
}

export function isUserTurn(line: DrillLineRow, ply: number): boolean {
  const stm = sideToMoveAtPly(line, ply);
  return stm === (line.userSide === 'white' ? 'w' : 'b');
}

/** FEN at a given ply (replays from start). Useful for board display + engine eval. */
export function fenAtPly(line: DrillLineRow, ply: number): string {
  return replayThroughPly(line, ply).fen();
}

/**
 * Replay `line.uciMoves[0..ply)` against a fresh chess.js instance and
 * return it. Wraps each move in try/catch + logs on failure so a bad
 * UCI in the indexed line surfaces in the console instead of silently
 * drifting the side-to-move (which made the drill effect schedule
 * opponent moves on a wrong-turn position, stranding the UI on
 * "Opponent thinking…").
 */
function replayThroughPly(line: DrillLineRow, ply: number): Chess {
  const chess = new Chess(line.startingFen);
  for (let i = 0; i < ply && i < line.uciMoves.length; i++) {
    const u = line.uciMoves[i];
    try {
      const m = chess.move({
        from: u.slice(0, 2),
        to: u.slice(2, 4),
        promotion: u.length > 4 ? u.slice(4, 5) : undefined,
      });
      if (!m) {
        // eslint-disable-next-line no-console
        console.warn(
          `[drill] replay refused UCI '${u}' at ply ${i} of line ${line.id}; ` +
            'drill state may drift. Chapter PGN likely contains a move the ' +
            'indexer mis-translated.',
        );
        break;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[drill] replay threw on UCI '${u}' at ply ${i} of line ${line.id}:`,
        err,
      );
      break;
    }
  }
  return chess;
}
