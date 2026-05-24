/**
 * Whitelist `http:` and `https:` URLs for rendering as user-clickable links.
 * Model-provided citations and any other untrusted source must go through
 * this before becoming an `href`, or a `javascript:` / `data:` URL could
 * execute when the user clicks the link.
 *
 * Returns the URL unchanged on pass, or `undefined` if the URL is malformed,
 * relative, or uses a disallowed scheme.
 */
export function safeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  return trimmed;
}
