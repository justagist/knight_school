import { useOnline } from '../hooks/useOnline';

/**
 * Thin top-of-viewport pill that surfaces when the browser thinks we're
 * offline. Muted Slate styling — informational only, not alarming. The
 * features that actually need network (chat send, study import, explain
 * move) carry their own disabled tooltip text; this banner is the
 * global signal that the user can correlate against.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="
        pointer-events-none fixed inset-x-0 z-40 flex justify-center
        top-[calc(env(safe-area-inset-top,0px)+0.5rem)]
        md:top-[calc(env(safe-area-inset-top,0px)+0.75rem)]
      "
    >
      <div className="pointer-events-auto rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-muted shadow-sm">
        Offline · network-bound features paused
      </div>
    </div>
  );
}
