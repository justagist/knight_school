/**
 * UUID generator that survives insecure contexts.
 *
 * `crypto.randomUUID()` only exists on the global `crypto` when the page
 * is a secure context (HTTPS or `localhost`). Accessing it over LAN HTTP
 * (e.g. `http://192.168.x.x:5174` during dev testing) throws
 * `TypeError: crypto.randomUUID is not a function`.
 *
 * For our drill ids the cryptographic strength doesn't matter — we only
 * need uniqueness within a single client's session. Fall back to a
 * Math.random-based id when the secure API isn't available.
 *
 * TODO(remove-insecure-fallback): the fallback branch exists only so the
 * dev LAN URL (plain HTTP) works during phone testing. Production deploy
 * (Cloudflare Pages) is HTTPS so `crypto.randomUUID` is always defined.
 * Delete the fallback branch + collapse this back to a one-liner once
 * the mobile-on-LAN testing cycle is over.
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
