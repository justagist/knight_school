import { useState, type ReactNode } from 'react';
import { useChatHost } from '../chat/ChatHost';

export type AnalysisTabKey = 'moves' | 'engine' | 'graph' | 'chat';

interface AnalysisTabsProps {
  /** Tab content map. Each entry rendered only when its tab is active. */
  panels: Partial<Record<AnalysisTabKey, ReactNode>>;
  /** Optional label suffixes / counts shown next to the tab name. */
  badges?: Partial<Record<AnalysisTabKey, string>>;
  initialTab?: AnalysisTabKey;
  /** Extra classes for the section wrapper (lets the caller size the column). */
  className?: string;
}

const TAB_ORDER: { key: AnalysisTabKey; label: string }[] = [
  { key: 'moves', label: 'Moves' },
  { key: 'engine', label: 'Engine' },
  { key: 'graph', label: 'Graph' },
  { key: 'chat', label: 'Chat' },
];

/**
 * Tab switcher for the Analyze view's secondary content. Used on every
 * viewport — mobile stacks it below the board, desktop places it as the
 * right column. Replaces the old "long stack of cards below the board"
 * pattern.
 *
 * The Chat tab is a thin trigger that opens the global chat panel via the
 * ChatHost. Full inline chat content lands later — for now we still surface
 * the tab so the layout maps 1:1 with the spec.
 */
export function AnalysisTabs({
  panels,
  badges,
  initialTab = 'moves',
  className = '',
}: AnalysisTabsProps) {
  const [tab, setTab] = useState<AnalysisTabKey>(initialTab);
  const chatHost = useChatHost();

  const visibleTabs = TAB_ORDER.filter((t) => t.key === 'chat' || panels[t.key] !== undefined);

  return (
    <section className={`card flex flex-col overflow-hidden ${className}`}>
      <div
        role="tablist"
        aria-label="Analysis tabs"
        className="flex shrink-0 border-b border-border bg-surface-2/60"
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
                  chatHost.setOpen(true);
                  return;
                }
                setTab(t.key);
              }}
              className={`flex h-11 flex-1 items-center justify-center gap-1 px-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-b-2 border-accent font-semibold text-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-primary'
              }`}
            >
              <span>{t.label}</span>
              {badges?.[t.key] && (
                <span className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px] tabular-nums text-muted">
                  {badges[t.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-[280px] flex-1 overflow-y-auto">
        {tab !== 'chat' && panels[tab]}
      </div>
    </section>
  );
}

// Backwards-compatible export name — old callers used `MobileAnalysisTabs`.
export { AnalysisTabs as MobileAnalysisTabs };
