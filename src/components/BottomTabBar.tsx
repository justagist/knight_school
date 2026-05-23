import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

interface TabDef {
  to: string;
  label: string;
  end?: boolean;
  /** Outline icon for inactive state. */
  outline: ReactNode;
  /** Filled icon for active state — same silhouette, more weight. */
  filled: ReactNode;
}

/**
 * Mobile-only bottom tab bar. Replaces the horizontally-scrolling top tabs
 * on screens <768px wide so primary navigation is always visible without
 * swipe.
 *
 * Layout: fixed-position, 64px tall (plus iOS safe-area inset). Active tab
 * gets accent color + filled icon variant; inactive tabs use outline icons
 * + muted text. Used alongside the desktop top-tab strip, which is hidden
 * on mobile via Tailwind responsive classes.
 *
 * The FAB ([ChatHost](src/chat/ChatHost.tsx) renders this via
 * [FloatingChatButton](src/chat/FloatingChatButton.tsx)) sits ABOVE this
 * bar, not in it — Elle is a cross-cutting feature, not a peer tab.
 */
export function BottomTabBar() {
  const tabs: TabDef[] = [
    {
      to: '/',
      label: 'Analyze',
      end: true,
      outline: <BoardIcon filled={false} />,
      filled: <BoardIcon filled />,
    },
    {
      to: '/openings',
      label: 'Openings',
      outline: <BookIcon filled={false} />,
      filled: <BookIcon filled />,
    },
    {
      to: '/plan',
      label: 'Plan',
      outline: <CalendarIcon filled={false} />,
      filled: <CalendarIcon filled />,
    },
    {
      to: '/settings',
      label: 'Settings',
      outline: <GearIcon filled={false} />,
      filled: <GearIcon filled />,
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink-200 bg-ink-50/95 backdrop-blur md:hidden dark:border-ink-800 dark:bg-ink-950/95"
      // Account for the home-indicator on iOS so labels aren't covered.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-accent'
                    : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden="true">{isActive ? t.filled : t.outline}</span>
                  <span>{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* --- Icons. Single SVG sized at 22×22 with stroke or fill controlled by
       the `filled` prop. Outline icons use stroke-only paths; filled
       variants use the same path with fill. --- */

function BoardIcon({ filled }: { filled: boolean }) {
  // A simplified 3x3 chess board grid — recognisable at small sizes.
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 9.5h17M3.5 15.5h17M9.5 3.5v17M15.5 3.5v17" stroke="currentColor" strokeOpacity={filled ? '0.4' : '1'} />
    </svg>
  );
}

function BookIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4.5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4z" />
      <path d="M20 4.5h-7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function CalendarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10.5h17" />
      <path d="M8 3.5v4M16 3.5v4" />
    </svg>
  );
}

function GearIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
      <path d="M19 12a7 7 0 0 0-.13-1.36l2-1.55-2-3.46-2.36.94a7 7 0 0 0-2.36-1.37L13.5 2.5h-3l-.65 2.7a7 7 0 0 0-2.36 1.37l-2.36-.94-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .47.05.92.13 1.36l-2 1.55 2 3.46 2.36-.94a7 7 0 0 0 2.36 1.37l.65 2.7h3l.65-2.7a7 7 0 0 0 2.36-1.37l2.36.94 2-3.46-2-1.55c.08-.44.13-.89.13-1.36z" />
    </svg>
  );
}
