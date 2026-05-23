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

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 transform">
      <div className="card flex items-center justify-between gap-3 px-4 py-3 shadow-lg">
        <div className="text-sm">
          <div className="font-medium">Update available</div>
          <div className="text-ink-500 dark:text-ink-400 text-xs">
            A new version of KnightSchool is ready.
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
          <button className="btn-primary text-xs" onClick={() => updateServiceWorker(true)}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
