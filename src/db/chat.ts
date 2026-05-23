import { db, type ChatMessageRow, type ChatThreadRow, type MoveCommentaryRow } from './db';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The general/idle chat thread has a fixed id so it persists across reloads
 * without needing context-id lookups.
 */
export const GENERAL_THREAD_ID = 'thread-general';

/**
 * Get-or-create the general thread. Idempotent — multiple callers race-safe.
 */
export async function ensureGeneralThread(): Promise<ChatThreadRow> {
  const existing = await db().chatThreads.get(GENERAL_THREAD_ID);
  if (existing) return existing;
  const now = Date.now();
  const row: ChatThreadRow = {
    id: GENERAL_THREAD_ID,
    contextType: 'general',
    title: 'Chat with Elle',
    createdAt: now,
    updatedAt: now,
  };
  await db().chatThreads.put(row);
  return row;
}

/**
 * Get-or-create the game thread for a given game-key (PGN hash). Title
 * defaults to the supplied label (usually the game-label from gameLabel()).
 */
export async function ensureGameThread(
  contextId: string,
  title: string,
): Promise<ChatThreadRow> {
  const existing = await db().chatThreads
    .where('contextId')
    .equals(contextId)
    .first();
  if (existing) return existing;
  const now = Date.now();
  const row: ChatThreadRow = {
    id: `thread-game-${contextId}`,
    contextType: 'game',
    contextId,
    title,
    createdAt: now,
    updatedAt: now,
  };
  await db().chatThreads.put(row);
  return row;
}

export async function listMessages(threadId: string): Promise<ChatMessageRow[]> {
  return db().chatMessages
    .where('threadId')
    .equals(threadId)
    .sortBy('createdAt');
}

export async function appendMessage(
  msg: Omit<ChatMessageRow, 'id' | 'createdAt'> & { createdAt?: number },
): Promise<ChatMessageRow> {
  const row: ChatMessageRow = {
    ...msg,
    id: uuid(),
    createdAt: msg.createdAt ?? Date.now(),
  };
  await db().transaction('rw', db().chatMessages, db().chatThreads, async () => {
    await db().chatMessages.add(row);
    const thread = await db().chatThreads.get(row.threadId);
    if (thread) await db().chatThreads.put({ ...thread, updatedAt: row.createdAt });
  });
  return row;
}

export async function clearThreadMessages(threadId: string): Promise<void> {
  await db().chatMessages.where('threadId').equals(threadId).delete();
}

// ─── Move commentary cache ───────────────────────────────────────────────

export function commentaryKey(
  fen: string,
  uciMove: string,
  provider: string,
  model: string,
): string {
  return `${fen}::${uciMove}::${provider}::${model}`;
}

export async function getCommentary(
  key: string,
): Promise<MoveCommentaryRow | undefined> {
  return db().moveCommentaries.get(key);
}

export async function putCommentary(row: MoveCommentaryRow): Promise<void> {
  await db().moveCommentaries.put(row);
}

/**
 * Stable hash for a PGN string. Used to scope game-thread + commentary
 * lookups so the same game across reloads finds its prior data.
 */
export function pgnHash(pgn: string): string {
  // djb2 — fast, stable, collision-resistant enough for ~thousands of games.
  let h = 5381;
  const s = pgn.trim();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
