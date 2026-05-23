/**
 * App footer. Stacks two short lines on mobile (avoids middot crowding),
 * collapses to one line on desktop.
 */
export function Footer() {
  const buildDate = __BUILD_DATE__ ? new Date(__BUILD_DATE__).toISOString().slice(0, 10) : 'dev';
  return (
    <footer className="mt-12 border-t border-border py-4 text-center text-[11px] text-faint">
      <div className="flex flex-col items-center gap-0.5 sm:flex-row sm:justify-center sm:gap-2">
        <span>
          KnightSchool v{__APP_VERSION__} · build {buildDate}
        </span>
        <span className="hidden sm:inline" aria-hidden>
          ·
        </span>
        <span>
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
