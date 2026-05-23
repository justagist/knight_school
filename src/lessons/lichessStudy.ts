import { getLichessToken } from '../db/lichessAuth';
import { putStudy, getStudy } from '../db/studies';
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
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Study is private — a Lichess token with access is required.');
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
  return row;
}

/** Has this study been imported already? Helper for catalog list UI. */
export async function isStudyImported(id: string): Promise<boolean> {
  const row = await getStudy(id);
  return !!row;
}
