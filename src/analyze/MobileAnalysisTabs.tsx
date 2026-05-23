import { useState, type ReactNode } from 'react';
import { useChatHost } from '../chat/ChatHost';

export type MobileTabKey = 'moves' | 'engine' | 'graph' | 'chat';

interface MobileAnalysisTabsProps {
  /** Tab content map. Each entry rendered only when its tab is active. */
  panels: Partial<Record<MobileTabKey, ReactNode>>;
  /** Optional label suffixes / counts shown next to the tab name. */
  badges?: Partial<Record<MobileTabKey, string>>;
  initialTab?: MobileTabKey;
}

const TAB_ORDER: { key: MobileTabKey; label: string }[] = [
  { key: 'moves', label: 'Moves' },
  { key: 'engine', label: 'Engine' },
  { key: 'graph', label: 'Graph' },
  { key: 'chat', label: 'Chat' },
];

/**
 * Mobile-only tab switcher for the Analyze view's secondary content. Below
 * `lg`, the screen collapses to: header → board → controls → CTA → these
 * tabs. The tabs replace the desktop side panel + the long stack of cards
 * below the board.
 *
 * The Chat tab is a thin trigger that opens the global chat panel via the
 * ChatHost — the full inline chat content lands in the chat overhaul
 * (section 3). Section 2 keeps the tab switcher self-contained.
 */
export function MobileAnalysisTabs({
  panels,
  badges,
  initialTab = 'moves',
}: MobileAnalysisTabsProps) {
  const [tab, setTab] = useState<MobileTabKey>(initialTab);
  const chatHost = useChatHost();

  const visibleTabs = TAB_ORDER.filter((t) => t.key === 'chat' || panels[t.key] !== undefined);

  return (
    <section className="card overflow-hidden lg:hidden">
      <div
        role="tablist"
        aria-label="Analysis tabs"
        className="flex border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/60"
      >
        {visibleTabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                if (t.key === 'chat') {
                  // Chat tab routes to the chat panel — inline content lands
                  // in the chat overhaul. For now we still surface the tab
                  // so the layout maps 1:1 with the spec.
                  chatHost.setOpen(true);
                  return;
                }
                setTab(t.key);
              }}
              className={`flex h-11 flex-1 items-center justify-center gap-1 px-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-100'
              }`}
            >
              <span>{t.label}</span>
              {badges?.[t.key] && (
                <span className="rounded bg-ink-200 px-1 py-0.5 text-[10px] font-mono tabular-nums text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                  {badges[t.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-[280px]">
        {tab !== 'chat' && panels[tab]}
      </div>
    </section>
  );
}
