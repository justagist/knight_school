/**
 * Translate raw engine / analysis errors into something a user can act on.
 *
 * Stockfish runs in a Web Worker that uses `SharedArrayBuffer` for the
 * multi-threaded `wasm` build. SharedArrayBuffer requires the page to be
 * `crossOriginIsolated` - which in turn requires:
 *
 *   - a secure context (HTTPS, or `localhost`), AND
 *   - `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-
 *     Policy: require-corp` response headers.
 *
 * The deploy at knightschool.pages.dev satisfies both via the `_headers`
 * file in `public/`. A common confusion point: opening the dev server over
 * the LAN (e.g. `http://192.168.1.x:5173`) does NOT satisfy the secure-
 * context rule even though the headers are sent - and the engine fails
 * with `SharedArrayBuffer is not defined`. We surface that explicitly so
 * the user doesn't have to grep their browser console.
 */
export function humanizeEngineError(raw: string | null | undefined): string {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('sharedarraybuffer')) {
    return 'Not cross-origin isolated - needs HTTPS (or localhost).';
  }
  if (lower.includes('worker') && lower.includes('failed')) {
    return 'Engine worker failed to start. Reload the tab.';
  }
  return raw;
}
