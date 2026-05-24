import { getLichessToken } from '../db/lichessAuth';
import { putStudy, getStudy } from '../db/studies';
import { indexStudyPositions } from '../db/drillPositions';
import type { StudyRow } from '../db/db';

/**
 * Parse a Lichess study id out of a URL or raw slug. Accepts:
 *   - 8-char alphanumeric slug ("abc12345")
 *   - https://lichess.org/study/abc12345
 *   - https://lichess.org/study/abc12345/xyz67890  (chapter URL — we drop the chapter, import the whole study)
 *   - lichess.org/study/abc12345 (no scheme)
 *
 * Returns null if nothing matches.
 */
export function extractStudyId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/lichess\.org\/study\/([A-Za-z0-9]{8})/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{8}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Parse a multi-game PGN (one chapter per game) into discrete chapter blobs.
 * Splits on the boundary `\n\n[Event ` which marks the start of a new game.
 * Extracts the ChapterName tag (a Lichess-specific tag) when present —
 * falls back to "Chapter N" if missing.
 */
export function parsePgnChapters(pgn: string): StudyRow['chapters'] {
  const normalized = pgn.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  // Split by blank-line-then-[Event boundary, but keep the [Event line in the
  // chunk. Splitter loses the matched text, so we re-attach it.
  const chunks: string[] = [];
  const re = /\n\n(?=\[Event )/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    chunks.push(normalized.slice(lastIdx, m.index));
    lastIdx = m.index + 2; // skip the leading "\n\n"
  }
  chunks.push(normalized.slice(lastIdx));
  return chunks.map((chunk, i) => {
    const titleMatch = chunk.match(/^\[ChapterName "([^"]*)"\]/m);
    const title = titleMatch?.[1]?.trim() || `Chapter ${i + 1}`;
    return { title, pgn: chunk.trim() };
  });
}

/** Pull the study title out of the first chapter's `[Event "Study: …"]` tag. */
export function extractStudyName(pgn: string, fallbackId: string): string {
  const m = pgn.match(/^\[Event "(?:Study: )?([^"]+)"\]/m);
  if (m) {
    // Lichess sometimes appends ": Chapter Name" to the Event tag. Trim that off.
    return m[1].split(':')[0].trim() || `Study ${fallbackId}`;
  }
  return `Study ${fallbackId}`;
}

/**
 * Fetch the raw PGN for a public study. Token is sent when configured for
 * better rate limits, but Lichess permits anonymous reads of public studies.
 */
export async function fetchStudyPgn(studyId: string): Promise<string> {
  const token = await getLichessToken();
  const headers: Record<string, string> = { Accept: 'application/x-chess-pgn' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let resp: Response;
  try {
    resp = await fetch(`https://lichess.org/api/study/${studyId}.pgn`, { headers });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Network error');
  }
  if (resp.status === 404) throw new Error('Study not found — check the URL.');
  if (resp.status === 401) {
    throw new Error(
      token
        ? 'Lichess rejected the token (401). Re-paste it in Settings → Lichess account.'
        : 'This study requires a Lichess token. Add one in Settings → Lichess account.',
    );
  }
  if (resp.status === 403) {
    // 403 from /api/study/{id}.pgn covers two distinct cases:
    //   (a) Study is private and the token (if any) doesn't have access.
    //   (b) Owner has disabled PGN export on an otherwise-public study.
    // We surface both because the user can't tell from outside which it is —
    // and the "private" message is wrong half the time.
    throw new Error(
      token
        ? 'Lichess returned 403 — your token doesn\'t have access, or the owner has disabled PGN export for this study.'
        : 'Lichess returned 403 — this study is private, or the owner has disabled PGN export. Add a Lichess token in Settings if you have access.',
    );
  }
  if (resp.status === 429) {
    throw new Error('Lichess rate-limited the request (429). Wait a moment and try again.');
  }
  if (!resp.ok) throw new Error(`Lichess responded ${resp.status}`);
  const text = await resp.text();
  if (!text.trim()) throw new Error('Lichess returned an empty PGN.');
  return text;
}

/**
 * Fetch + parse + persist. Returns the freshly stored row. Re-importing the
 * same id overwrites the existing row (manual-refresh semantics — no SWR for
 * studies, since they're user-curated content rather than DB lookups).
 */
export async function importStudy(
  studyId: string,
  opts?: { curatedKey?: string },
): Promise<StudyRow> {
  const rawPgn = await fetchStudyPgn(studyId);
  const chapters = parsePgnChapters(rawPgn);
  const row: StudyRow = {
    id: studyId,
    name: extractStudyName(rawPgn, studyId),
    rawPgn,
    chapters,
    importedAt: Date.now(),
    curatedKey: opts?.curatedKey,
  };
  await putStudy(row);
  // Rebuild the position pool every import so mixed / spot drills always
  // reflect the latest chapter list. Non-blocking on import failure —
  // per-chapter drills don't depend on this.
  try {
    await indexStudyPositions(row);
  } catch {
    // swallow — indexer logs internally; chapter-line drills still work.
  }
  return row;
}

/** Has this study been imported already? Helper for catalog list UI. */
export async function isStudyImported(id: string): Promise<boolean> {
  const row = await getStudy(id);
  return !!row;
}
