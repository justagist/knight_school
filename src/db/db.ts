import Dexie, { type EntityTable } from 'dexie';

/**
 * A cached engine evaluation for a single position, keyed by FEN.
 * Same FEN can appear across many games — by sharing storage we avoid
 * re-analyzing common positions (opening theory, classic endgames, …).
 *
 * `lines` carries the same shape as PvLine (engine/types.ts) but we keep a
 * structural copy here so the DB layer doesn't depend on engine types.
 */
export interface PositionEvalRow {
  /** Canonical FEN with all 6 fields. Primary key. */
  fen: string;
  /** Side to move at this position. */
  turn: 'w' | 'b';
  /** Engine depth that produced this eval. */
  depth: number;
  /** Top engine move in UCI (e.g. "e2e4", "e7e8q"). */
  bestUci?: string;
  /** Centipawn score from side-to-move's perspective. */
  scoreCp?: number;
  /** Mate distance; positive = side-to-move mates. */
  mate?: number;
  /** Multi-PV lines (we store all three). */
  lines: Array<{
    pvIndex: number;
    depth: number;
    scoreCp?: number;
    mate?: number;
    uciMoves: string[];
  }>;
  /** ms epoch when the eval finished. */
  completedAt: number;
  /** Engine variant that produced this — invalidates if user changes engine. */
  engine: 'lite' | 'full';
}

export class KsDatabase extends Dexie {
  positionEvals!: EntityTable<PositionEvalRow, 'fen'>;

  constructor() {
    super('knightschool');
    this.version(1).stores({
      // primary key is fen; we also index `completedAt` so the future
      // storage-management UI can show recency or trim old entries.
      positionEvals: '&fen, completedAt, engine',
    });
  }
}

let _db: KsDatabase | null = null;

/** Lazy singleton — avoids creating Dexie at import time in test envs. */
export function db(): KsDatabase {
  if (_db) return _db;
  _db = new KsDatabase();
  return _db;
}
