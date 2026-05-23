import { useEffect, useState } from 'react';

/**
 * Reactive wrapper around navigator.onLine. Used by chat UI to disable the
 * input when offline (and surface the persistent offline banner from spec
 * §"Offline Support").
 *
 * Note: navigator.onLine is a hint, not a guarantee — a connected device
 * with no real internet still reports true. We trust it for "definitely
 * offline" but real errors from fetch still need to be handled separately.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
