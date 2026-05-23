import { NavLink } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';

const NAV = [
  { to: '/', label: 'Analyze' },
  { to: '/openings', label: 'Openings' },
  { to: '/plan', label: 'Plan' },
  { to: '/settings', label: 'Settings' },
];

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
  const label = mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System';
  return (
    <button
      type="button"
      className="btn-ghost text-xs"
      onClick={() => setMode(next)}
      title={`Theme: ${label} (click to cycle)`}
      aria-label={`Theme: ${label}, click to cycle`}
    >
      {mode === 'light' ? '☀' : mode === 'dark' ? '☾' : '⌘'} {label}
    </button>
  );
}

function KnightMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-7 w-7 text-accent"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11 4c-1 2-2 3-4 4l1 3 2-1c-1 2-3 4-4 7l3 1-1 3h14V19c0-7-3-12-8-15zM10 25h12v3H10z" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-ink-50/80 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          <KnightMark />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">KnightSchool</div>
            <div className="text-[11px] text-ink-500 dark:text-ink-400">Chess made easy.</div>
          </div>
        </div>

        <nav className="ml-2 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `inline-flex rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-ink-200 text-ink-900 dark:bg-ink-800 dark:text-ink-100'
                        : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
