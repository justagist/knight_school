import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/analyze', label: 'Analyze' },
  { to: '/study', label: 'Study' },
  { to: '/plan', label: 'Plan' },
  { to: '/settings', label: 'Settings' },
];

/**
 * Three-way segmented control for theme selection. Consistent appearance in
 * both light and dark modes (the old cycle button had a button frame in
 * light + no frame in dark - jarring).
 */
function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const opts: { value: 'light' | 'dark' | 'system'; label: string; glyph: string }[] = [
    { value: 'light', label: 'Light', glyph: '☀' },
    { value: 'dark', label: 'Dark', glyph: '☾' },
    { value: 'system', label: 'System', glyph: '⌬' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-md border border-border bg-surface-2 p-0.5 text-xs"
    >
      {opts.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(o.value)}
            title={o.label}
            // Inactive options use primary text at 60% opacity so both the
            // glyph and the label read at the same contrast level - the
            // old `text-muted` made the icons nearly invisible in light
            // mode against the bg-surface-2 container.
            style={active ? undefined : { color: 'color-mix(in srgb, var(--text-primary) 60%, transparent)' }}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 transition-colors ${
              active
                ? 'bg-accent-soft text-accent'
                : 'hover:text-primary'
            }`}
          >
            <span aria-hidden="true">{o.glyph}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
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
    <header
      className="sticky top-0 z-30 border-b border-border backdrop-blur"
      style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface-1) 80%, transparent)' }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link
          to="/"
          className="-m-1 flex items-center gap-2 rounded p-1 text-primary transition-colors hover:bg-surface-2"
          aria-label="KnightSchool - home"
          title="Back to Analyze"
        >
          <KnightMark />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight text-primary">KnightSchool</div>
            <div className="text-[11px] text-muted">Chess made easy.</div>
          </div>
        </Link>

        {/* Top tabs - desktop only. On mobile a BottomTabBar replaces this
            so primary nav is always visible without horizontal scrolling.
            `mx-auto` centres the nav within the bounded header container so
            the row doesn't read as brand-tight-nav-empty-space-toggle on
            wide displays. */}
        <nav
          className="mx-auto hidden md:block"
          aria-label="Primary (desktop)"
        >
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `inline-flex rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-surface-2 text-primary'
                        : 'text-muted hover:bg-surface-2 hover:text-primary'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Spacer pushes the theme toggle to the right edge when the desktop
            nav is hidden (mobile). On desktop the nav already does this. */}
        <div className="ml-auto md:hidden" />
        <ThemeToggle />
      </div>
    </header>
  );
}
