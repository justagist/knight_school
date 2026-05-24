import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // eslint-disable-next-line no-console
      console.warn('SW registration failed:', error);
    },
  });

  if (!needRefresh) return null;

  // Mobile: bottom-centered above the BottomTabBar (h-16 ≈ 4rem).
  // Desktop: a bottom-right toast (≥md) so it doesn't cover the main
  // content. Dismissal is React-state only, so the banner reappears on
  // the next page load if the SW is still in `needRefresh`.
  return (
    <div
      role="status"
      aria-live="polite"
      className="
        fixed z-50
        bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 w-[min(92vw,420px)] -translate-x-1/2
        md:bottom-4 md:right-4 md:left-auto md:translate-x-0 md:w-[360px]
      "
    >
      <div className="card flex items-start justify-between gap-3 px-4 py-3 shadow-lg">
        <div className="min-w-0 text-sm">
          <div className="font-medium">Update available</div>
          <div className="mt-0.5 text-xs text-muted">
            A new version of KnightSchool is available.
          </div>
          <button
            type="button"
            className="btn-primary mt-2 text-xs"
            onClick={() => updateServiceWorker(true)}
          >
            Reload to update
          </button>
        </div>
        <button
          type="button"
          aria-label="Dismiss update notification"
          title="Dismiss for this session"
          onClick={() => setNeedRefresh(false)}
          className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-primary"
        >
          ×
        </button>
      </div>
    </div>
  );
}
