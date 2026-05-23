export function Footer() {
  const buildDate = __BUILD_DATE__ ? new Date(__BUILD_DATE__).toISOString().slice(0, 10) : 'dev';
  return (
    <footer className="mt-12 border-t border-ink-200 py-4 text-center text-[11px] text-ink-500 dark:border-ink-800 dark:text-ink-400">
      <span>
        KnightSchool v{__APP_VERSION__} · build {buildDate} · MIT ·{' '}
        <a
          className="underline-offset-2 hover:underline"
          href="https://github.com/justagist/knight_school"
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>
      </span>
    </footer>
  );
}
