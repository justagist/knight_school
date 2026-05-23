import { db, type LichessAuthRow } from './db';

/** Always store under the same key — Lichess auth is single-user. */
const SINGLETON_ID = 'singleton' as const;

/** Returns the saved token row, or undefined if the user hasn't configured one. */
export async function getLichessAuth(): Promise<LichessAuthRow | undefined> {
  return db().lichessAuth.get(SINGLETON_ID);
}

/**
 * Convenience for callers that just need the raw token. Avoids fanning the
 * whole row out when only the bearer string is wanted (Explorer client).
 */
export async function getLichessToken(): Promise<string | undefined> {
  const row = await getLichessAuth();
  return row?.token;
}

export async function putLichessAuth(
  patch: Partial<Omit<LichessAuthRow, 'id'>> & { token: string },
): Promise<LichessAuthRow> {
  const existing = await getLichessAuth();
  const row: LichessAuthRow = {
    id: SINGLETON_ID,
    label: patch.label ?? existing?.label ?? 'Lichess',
    token: patch.token,
    lastTestedAt: existing?.lastTestedAt,
    lastTestStatus: existing?.lastTestStatus,
    lastTestMessage: existing?.lastTestMessage,
  };
  await db().lichessAuth.put(row);
  return row;
}

export async function clearLichessAuth(): Promise<void> {
  await db().lichessAuth.delete(SINGLETON_ID);
}

/** Record the outcome of a /api/account ping. */
export async function recordLichessTest(
  status: 'ok' | 'error',
  message?: string,
): Promise<void> {
  const row = await getLichessAuth();
  if (!row) return;
  await db().lichessAuth.put({
    ...row,
    lastTestedAt: Date.now(),
    lastTestStatus: status,
    lastTestMessage: message,
  });
}

/**
 * Hit Lichess's /api/account endpoint to validate the token. Returns the
 * user's username on success; throws on failure with a useful message.
 *
 * /api/account requires any valid token (no special scope). It's the same
 * endpoint Lichess docs recommend for token verification.
 */
export async function testLichessToken(token: string): Promise<{ username: string }> {
  if (!token.trim()) throw new Error('Token is empty.');
  let resp: Response;
  try {
    resp = await fetch('https://lichess.org/api/account', {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Network error');
  }
  if (resp.status === 401) throw new Error('Token rejected (401). Check the value.');
  if (!resp.ok) throw new Error(`Lichess responded ${resp.status}`);
  const data = (await resp.json()) as { username?: string };
  if (!data.username) throw new Error('Unexpected response from Lichess.');
  return { username: data.username };
}
