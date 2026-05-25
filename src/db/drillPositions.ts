import { parsePgn as parseChessopsPgn, startingPosition, type ChildNode, type PgnNodeData } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { makeFen } from 'chessops/fen';
import { makeUci } from 'chessops/util';
import type { Position } from 'chessops/chess';
import { db, type DrillPositionRow, type StudyRow } from './db';
import { normalizeFenForExplorer } from './explorer';

/**
 * Walk every node in every chapter's PGN tree - main line *plus* all
 * variations - and aggregate every visited position into the
 * `drillPositions` table. Each row groups every occurrence of one FEN
 * (across chapters AND across mainline/sideline) along with the move
 * played from that position and the side-to-move.
 *
 * Called on study import / re-import. Idempotent - overwrites existing rows
 * for the study so a refresh brings the pool in sync without orphan entries.
 *
 * Implementation note: chess.js v1.4's `loadPgn` flattens variations to
 * the main line through `history()`, which is why we use chessops here.
 * chessops's `parsePgn` returns a `Game<PgnNodeData>` whose `moves` field
 * is a tree (each node carries a `children` array); each child node
 * after the first is a variation. Depth-first walk visits every move,
 * applying SAN to a cloned `Position` so the FEN we record is the
 * position-BEFORE the move.
 *
 * Studies that fail chessops parse (board-editor diagrams, malformed
 * PGN) are skipped - per-chapter drills still work for them.
 */
export async function indexStudyPositions(study: StudyRow): Promise<void> {
  const { rows } = buildStudyPositions(study);
  await db().transaction('rw', db().drillPositions, async () => {
    await db().drillPositions.where('studyId').equals(study.id).delete();
    if (rows.length > 0) await db().drillPositions.bulkPut(rows);
  });
}

export interface BuildPositionsResult {
  rows: DrillPositionRow[];
  /** Titles of chapters chessops couldn't parse - surfaced as a soft
   *  warning to the user since per-chapter drills still work for these
   *  but mixed / spot drills will miss those chapters. */
  skippedChapters: string[];
}

/**
 * Build (without writing) the position-pool rows for a study. Pure CPU
 * work so it can run inside an atomic transaction that also stores the
 * StudyRow - see importStudy.
 */
export function buildStudyPositions(study: StudyRow): BuildPositionsResult {
  const byKey = new Map<string, DrillPositionRow>();
  const skippedChapters: string[] = [];

  for (let cIdx = 0; cIdx < study.chapters.length; cIdx++) {
    const chapter = study.chapters[cIdx];
    const games = safeParsePgn(chapter.pgn);
    if (games.length === 0) {
      skippedChapters.push(chapter.title);
      continue;
    }

    // chessops returns an array; per spec each chapter is one game so
    // we use the first. Multi-game chapters are unusual in Lichess
    // studies and we accept the simplification.
    const game = games[0];
    const posResult = startingPosition(game.headers);
    if (!posResult.isOk) {
      skippedChapters.push(chapter.title);
      continue;
    }
    const startPos = posResult.value;

    walkTree(game.moves, startPos, {
      chapterIndex: cIdx,
      chapterTitle: chapter.title,
      depth: 0,
      sink: byKey,
      studyId: study.id,
    });
  }

  return { rows: [...byKey.values()], skippedChapters };
}

interface WalkCtx {
  chapterIndex: number;
  chapterTitle: string;
  depth: number;
  sink: Map<string, DrillPositionRow>;
  studyId: string;
}

/**
 * Depth-first traversal. For each child node:
 *   1. Read the SAN, parse against the parent position to get the Move.
 *   2. Record an occurrence (FEN-before, SAN/UCI, side-to-move, ply).
 *   3. Clone + play the move, recurse with depth+1.
 *
 * chessops's tree puts the FIRST child as the main-line continuation and
 * any subsequent children as variations from the same starting position;
 * the walker doesn't distinguish - every reachable position lands in the
 * pool, which is the whole point of the variation walk.
 */
function walkTree(node: { children: ChildNode<PgnNodeData>[] }, pos: Position, ctx: WalkCtx) {
  for (const child of node.children) {
    const san = child.data.san;
    const move = parseSan(pos, san);
    if (!move) {
      // Illegal SAN under the current position - skip this branch but
      // continue with siblings. Happens with malformed PGN; rare.
      continue;
    }
    const fenBefore = normalizeFenForExplorer(makeFen(pos.toSetup()));
    const sideToMove: 'w' | 'b' = pos.turn === 'white' ? 'w' : 'b';
    const id = positionRowId(ctx.studyId, fenBefore);
    let row = ctx.sink.get(id);
    if (!row) {
      row = { id, studyId: ctx.studyId, fen: fenBefore, occurrences: [] };
      ctx.sink.set(id, row);
    }
    // chessops's makeUci emits chess960-style castling (king to rook
    // square, e.g. "e1h1"). chess.js v1.4 only accepts king-to-
    // destination form ("e1g1") and THROWS on the 960 form, which
    // hangs the MixedDrillView opp-effect when the opponent picks
    // castling. Re-emit standard form here using SAN as the discriminator.
    let uci = makeUci(move);
    if (san === 'O-O' || san === 'O-O-O') {
      const fromFile = uci[0];
      const fromRank = uci[1];
      const destFile = san === 'O-O' ? 'g' : 'c';
      uci = `${fromFile}${fromRank}${destFile}${fromRank}`;
    }
    row.occurrences.push({
      chapterIndex: ctx.chapterIndex,
      chapterTitle: ctx.chapterTitle,
      san,
      uci,
      sideToMove,
      ply: ctx.depth,
    });
    const nextPos = pos.clone();
    nextPos.play(move);
    walkTree(child, nextPos, { ...ctx, depth: ctx.depth + 1 });
  }
}

function safeParsePgn(pgn: string) {
  try {
    return parseChessopsPgn(pgn);
  } catch {
    return [];
  }
}

export function positionRowId(studyId: string, fenKey: string): string {
  return `${studyId}::${fenKey}`;
}

export async function listPositionsForStudy(studyId: string): Promise<DrillPositionRow[]> {
  return db().drillPositions.where('studyId').equals(studyId).toArray();
}

export async function getPositionRow(
  studyId: string,
  fen: string,
): Promise<DrillPositionRow | undefined> {
  return db().drillPositions.get(positionRowId(studyId, normalizeFenForExplorer(fen)));
}

export async function deletePositionsForStudy(studyId: string): Promise<void> {
  await db().drillPositions.where('studyId').equals(studyId).delete();
}
