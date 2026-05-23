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

export type LlmProviderId = 'anthropic' | 'openai' | 'gemini';

/**
 * A stored LLM API key. Multiple keys per provider are supported
 * (work / personal / different orgs); one is marked "active" per provider
 * via {@link ProviderConfigRow}.activeKeyId.
 *
 * Keys are stored in Dexie so they survive in the export/import backup —
 * the export flow has an "Include API keys" toggle (default OFF) so casual
 * backup-sharing doesn't leak credentials.
 */
export interface ApiKeyRow {
  /** UUID-ish stable id. Primary key. */
  id: string;
  provider: LlmProviderId;
  /** Free-text label the user picks ("Personal", "Work", "Free-tier"). */
  label: string;
  /** Raw API key string. */
  apiKey: string;
  /** Model id selected for this key (provider-specific). */
  model: string;
  /** ms epoch. */
  createdAt: number;
  /** ms epoch of most recent successful or failed Test Connection. */
  lastTestedAt?: number;
  /** Outcome of last test. */
  lastTestStatus?: 'ok' | 'error';
  /** Human-readable error message if last test failed. */
  lastTestMessage?: string;
}

/**
 * Per-provider configuration: which saved key is the "active" one for that
 * provider, and provider-level toggles. One row per provider id.
 */
export interface ProviderConfigRow {
  provider: LlmProviderId;
  /** ApiKeyRow.id, or null when no key is configured for this provider. */
  activeKeyId: string | null;
  /**
   * When the active key hits a rate-limit / quota error, the chat layer
   * (Step 6) falls through to the next saved key in round-robin order.
   * User can disable this for strict explicit-control mode.
   */
  fallbackEnabled: boolean;
}

/**
 * Global setting: which provider Elle is currently using. One singleton row
 * keyed by the literal string 'singleton'.
 */
export interface LlmGlobalRow {
  id: 'singleton';
  /** Active provider for Elle. null until the user has picked one. */
  activeProvider: LlmProviderId | null;
}

/**
 * A chat thread. The general/idle thread is one row with contextType='general'
 * and a fixed id; per-game threads have contextType='game' and a contextId
 * keyed off the PGN hash so reloading the same game restores its chat.
 */
export interface ChatThreadRow {
  id: string;
  contextType: 'general' | 'game';
  /** For 'game' threads, the stable PGN hash. Undefined for general. */
  contextId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * One turn in a thread. We persist provider/model/key on the assistant turn
 * so the UI can render "via Claude Sonnet" captions and signal when a
 * non-primary key was used as a fallback.
 */
export interface ChatMessageRow {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  /** Assistant-only: which provider/model/key produced this turn. */
  provider?: LlmProviderId;
  model?: string;
  keyId?: string;
  /** True if the provider's web-search tool was actually invoked. */
  usedWebSearch?: boolean;
  /** Web-search citations (URL + title) when usedWebSearch is true. */
  citations?: Array<{ url: string; title?: string }>;
  /** For assistant errors — captures the message so we can render it inline. */
  errorMessage?: string;
}

/**
 * Per-move Elle commentary cache. Spec: cache by (FEN + move). We also
 * include provider+model in the key since different models produce
 * meaningfully different commentary — caching across models would be wrong.
 */
export interface MoveCommentaryRow {
  /** Composite key: `${fen}::${uciMove}::${provider}::${model}`. */
  key: string;
  fen: string;
  uciMove: string;
  provider: LlmProviderId;
  model: string;
  text: string;
  usedWebSearch: boolean;
  citations?: Array<{ url: string; title?: string }>;
  createdAt: number;
}

/**
 * A cached Lichess Opening Explorer (Masters DB) lookup, keyed by the
 * position-only portion of the FEN. We only store the fields that drive
 * classification + UI (total games + opening name) — the full response
 * lives in the service-worker runtime cache for offline reuse.
 *
 * "Book" classification fires when `totalGames >= 1000`.
 */
/**
 * Singleton row holding the user's optional Lichess API token. Stored
 * separately from LLM `apiKeys` because it's a different credential
 * category (not an LLM provider — a Lichess account token used for the
 * Opening Explorer and Study endpoints).
 *
 * Lichess started requiring auth for the Explorer in 2026; this is opt-in
 * and the app falls back to bundled ECO when absent.
 */
export interface LichessAuthRow {
  id: 'singleton';
  /** Personal access token from lichess.org/account/oauth/token. */
  token: string;
  /** Free-text label (defaults to "Lichess"). */
  label: string;
  /** ms epoch of last test connection. */
  lastTestedAt?: number;
  /** Outcome of last test. */
  lastTestStatus?: 'ok' | 'error';
  lastTestMessage?: string;
}

export interface ExplorerEntryRow {
  /** Normalized FEN: position + side-to-move + castling + en-passant only. */
  fen: string;
  /** white + draws + black, computed at fetch time. */
  totalGames: number;
  /** Lichess's "opening" name, e.g. "Caro-Kann Defense: Exchange Variation". */
  openingName?: string;
  /** ECO code, e.g. "B13". */
  ecoCode?: string;
  /**
   * Top popular continuations from this position, each with its own opening
   * tag (if Lichess names it). Lets the UI render "narrows to:" lists so
   * the user can see which lines they're choosing between. Omitted on rows
   * cached before this field was introduced — UI falls back gracefully.
   */
  topContinuations?: Array<{
    san: string;
    openingName?: string;
    ecoCode?: string;
    /** white + draws + black for this continuation. */
    gameCount: number;
  }>;
  /** ms epoch when this row was written. */
  fetchedAt: number;
}

/**
 * One recorded guess from "Guess the move" mode. Indexed by gameKey so
 * per-game accuracy reads quickly; aggregate stats sweep the table.
 */
/**
 * An imported Lichess Study. We keep the raw PGN plus a parsed chapter
 * breakdown so the viewer can render chapters without re-parsing on every
 * mount. Refresh is manual — re-import overwrites the existing row.
 */
export interface StudyRow {
  /** Lichess study id (8-char slug). Primary key. */
  id: string;
  /** Study title — falls back to `Study {id}` if Lichess didn't tag one. */
  name: string;
  /** Full multi-game PGN as Lichess returned it. */
  rawPgn: string;
  /** Pre-parsed chapter list. */
  chapters: Array<{
    /** ChapterName tag, or `Chapter N` if missing. */
    title: string;
    /** Single-game PGN slice for this chapter. */
    pgn: string;
  }>;
  /** ms epoch when the study was imported / last refreshed. */
  importedAt: number;
  /** Catalog id when imported from the curated list; undefined for user imports. */
  curatedKey?: string;
}

export interface GuessRecordRow {
  /** UUID. Primary key. */
  id: string;
  /** Stable PGN hash for the game this guess belongs to. */
  gameKey: string;
  /** Ply being guessed (1-based; same as moves[i] where i = ply-1). */
  ply: number;
  /** FEN of the position the user was looking at before their guess. */
  fenBefore: string;
  guessUci: string;
  guessSan: string;
  playedUci: string;
  playedSan: string;
  engineBestUci?: string;
  engineBestSan?: string;
  matchesPlayed: boolean;
  matchesEngine: boolean;
  /** ms epoch. */
  createdAt: number;
}

export class KsDatabase extends Dexie {
  positionEvals!: EntityTable<PositionEvalRow, 'fen'>;
  apiKeys!: EntityTable<ApiKeyRow, 'id'>;
  providerConfig!: EntityTable<ProviderConfigRow, 'provider'>;
  llmGlobal!: EntityTable<LlmGlobalRow, 'id'>;
  chatThreads!: EntityTable<ChatThreadRow, 'id'>;
  chatMessages!: EntityTable<ChatMessageRow, 'id'>;
  moveCommentaries!: EntityTable<MoveCommentaryRow, 'key'>;
  guessRecords!: EntityTable<GuessRecordRow, 'id'>;
  explorerEntries!: EntityTable<ExplorerEntryRow, 'fen'>;
  lichessAuth!: EntityTable<LichessAuthRow, 'id'>;
  studies!: EntityTable<StudyRow, 'id'>;

  constructor() {
    super('knightschool');
    this.version(1).stores({
      positionEvals: '&fen, completedAt, engine',
    });
    // v2: LLM key storage (multi-key per provider + active-key tracking).
    this.version(2).stores({
      positionEvals: '&fen, completedAt, engine',
      apiKeys: '&id, provider, createdAt',
      providerConfig: '&provider',
      llmGlobal: '&id',
    });
    // v3: chat threads/messages + per-move commentary cache.
    this.version(3).stores({
      positionEvals: '&fen, completedAt, engine',
      apiKeys: '&id, provider, createdAt',
      providerConfig: '&provider',
      llmGlobal: '&id',
      chatThreads: '&id, contextType, contextId, updatedAt',
      chatMessages: '&id, threadId, createdAt',
      moveCommentaries: '&key, fen, createdAt',
    });
    // v4: guess-the-move records.
    this.version(4).stores({
      positionEvals: '&fen, completedAt, engine',
      apiKeys: '&id, provider, createdAt',
      providerConfig: '&provider',
      llmGlobal: '&id',
      chatThreads: '&id, contextType, contextId, updatedAt',
      chatMessages: '&id, threadId, createdAt',
      moveCommentaries: '&key, fen, createdAt',
      guessRecords: '&id, gameKey, createdAt, [gameKey+ply]',
    });
    // v5: Lichess Opening Explorer cache (parsed totals + opening name).
    this.version(5).stores({
      positionEvals: '&fen, completedAt, engine',
      apiKeys: '&id, provider, createdAt',
      providerConfig: '&provider',
      llmGlobal: '&id',
      chatThreads: '&id, contextType, contextId, updatedAt',
      chatMessages: '&id, threadId, createdAt',
      moveCommentaries: '&key, fen, createdAt',
      guessRecords: '&id, gameKey, createdAt, [gameKey+ply]',
      explorerEntries: '&fen, fetchedAt',
    });
    // v6: optional Lichess API token (separate from LLM keys — different
    // credential category, different consumer).
    this.version(6).stores({
      positionEvals: '&fen, completedAt, engine',
      apiKeys: '&id, provider, createdAt',
      providerConfig: '&provider',
      llmGlobal: '&id',
      chatThreads: '&id, contextType, contextId, updatedAt',
      chatMessages: '&id, threadId, createdAt',
      moveCommentaries: '&key, fen, createdAt',
      guessRecords: '&id, gameKey, createdAt, [gameKey+ply]',
      explorerEntries: '&fen, fetchedAt',
      lichessAuth: '&id',
    });
    // v7: Lichess Study imports for the Openings tab.
    this.version(7).stores({
      positionEvals: '&fen, completedAt, engine',
      apiKeys: '&id, provider, createdAt',
      providerConfig: '&provider',
      llmGlobal: '&id',
      chatThreads: '&id, contextType, contextId, updatedAt',
      chatMessages: '&id, threadId, createdAt',
      moveCommentaries: '&key, fen, createdAt',
      guessRecords: '&id, gameKey, createdAt, [gameKey+ply]',
      explorerEntries: '&fen, fetchedAt',
      lichessAuth: '&id',
      studies: '&id, importedAt, curatedKey',
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
