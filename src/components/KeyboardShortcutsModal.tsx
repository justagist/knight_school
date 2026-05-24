import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['?'], description: 'Open this shortcuts list' },
  { keys: ['←'], description: 'Previous move' },
  { keys: ['→'], description: 'Next move' },
  { keys: ['Home'], description: 'Jump to start of game' },
  { keys: ['End'], description: 'Jump to end of game' },
  { keys: ['F'], description: 'Flip board orientation' },
  { keys: ['Esc'], description: 'Close chat / modals' },
];

/**
 * App-wide keyboard shortcut reference. Listens for `?` anywhere outside
 * a text input and opens. Esc / click-outside closes.
 *
 * The shortcuts themselves are wired in the screens that own them
 * (AnalyzeView handles arrows + f, ChatPanel handles Esc, etc.) - this
 * modal is purely informational so a user can discover them without
 * digging through Settings.
 */
export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="card max-w-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary"
            aria-label="Close"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.description} className="contents">
              <dt className="font-mono text-xs">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-block rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-primary"
                  >
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd className="text-muted">{s.description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] text-muted">
          Press <kbd className="rounded border border-border bg-surface-2 px-1">?</kbd> any
          time to reopen this list.
        </p>
      </div>
    </div>
  );
}
