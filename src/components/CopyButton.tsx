import { useEffect, useState } from 'react';

interface CopyButtonProps {
  /** Text to copy. If a function, called on click (lazy - useful for large strings). */
  text: string | (() => string);
  /** Default button label (before copy). */
  label?: string;
  /** Label briefly shown after a successful copy. */
  copiedLabel?: string;
  className?: string;
  /** Optional title/aria fallback when `label` is empty (icon-only). */
  title?: string;
  /** How long to show the "copied" state before reverting (ms). */
  resetMs?: number;
}

/**
 * Small generic button that copies text to clipboard and flashes a confirmation.
 * Falls back gracefully when navigator.clipboard isn't available (eg http: served).
 */
export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'btn-ghost text-xs',
  title,
  resetMs = 1500,
}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const id = window.setTimeout(() => setState('idle'), resetMs);
    return () => window.clearTimeout(id);
  }, [state, resetMs]);

  const onClick = async () => {
    const value = typeof text === 'function' ? text() : text;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for non-HTTPS or older browsers.
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setState('copied');
    } catch {
      setState('error');
    }
  };

  const display = state === 'copied' ? copiedLabel : state === 'error' ? 'Copy failed' : label;

  return (
    <button type="button" className={className} onClick={onClick} title={title ?? label}>
      {display}
    </button>
  );
}
