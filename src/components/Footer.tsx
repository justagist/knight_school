/**
 * App footer. On desktop the content sits in the same `max-w-7xl` container
 * as the rest of the page; version info is left-aligned and the licence /
 * source link sits right. On mobile the two halves stack vertically — the
 * mid-dots between items get too cramped otherwise.
 */
export function Footer() {
  const buildDate = __BUILD_DATE__ ? new Date(__BUILD_DATE__).toISOString().slice(0, 10) : 'dev';
  return (
    <footer className="mt-12 border-t border-border py-4 text-[11px]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-1 px-4 sm:flex-row sm:justify-between">
        <span className="text-faint">
          KnightSchool v{__APP_VERSION__} · build {buildDate}
        </span>
        <span className="text-muted">
          MIT ·{' '}
          <a
            className="underline-offset-2 hover:text-primary hover:underline"
            href="https://github.com/justagist/knight_school"
            target="_blank"
            rel="noreferrer"
          >
            source
          </a>
        </span>
      </div>
    </footer>
  );
}
