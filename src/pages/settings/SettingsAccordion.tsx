import { useState, type ReactNode } from 'react';

interface SettingsAccordionProps {
  id: string;
  title: string;
  /** Open by default? Appearance defaults to open, every other section closed
   *  per spec — keeps the Settings page from feeling like a wall of cards. */
  defaultOpen?: boolean;
  children: ReactNode;
  /** Optional right-side badge / status — rendered next to the title. */
  rightSlot?: ReactNode;
}

/**
 * Collapsible section card used throughout the Settings page. Replaces the
 * old "always-open uppercase header" pattern so the page is a tight stack
 * of titles by default; users tap to drill in.
 *
 * Implementation: plain card + button summary + height-toggled body. Using
 * a button (not `<details>`) gives consistent styling across browsers and
 * lets us animate the chevron + keep focus management simple.
 */
export function SettingsAccordion({
  id,
  title,
  defaultOpen = false,
  rightSlot,
  children,
}: SettingsAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${id}-body`;
  return (
    <section className="card overflow-hidden" id={id}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        <div className="flex items-center gap-2">
          {rightSlot}
          <span
            className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            ▾
          </span>
        </div>
      </button>
      {open && (
        <div id={bodyId} className="border-t border-border p-4">
          {children}
        </div>
      )}
    </section>
  );
}
