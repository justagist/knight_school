import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Drill-active flag + chat-invalidation hand-off. Lives at the app root so
 * the chat panel can detect "user is in a drill" without prop-drilling.
 *
 * Flow:
 *   1. DrillView calls `setActive(true)` on mount, `setActive(false)` on unmount.
 *   2. When the user opens the chat panel while a drill is active, the panel
 *      consults `shouldWarn()` - true once per session per attempt.
 *   3. If the user accepts the warning, panel calls `markInvalidatedAndOpen()`
 *      which triggers the registered invalidate callback (from DrillView)
 *      and clears the warning flag for the rest of this attempt.
 */
interface DrillContextValue {
  /** True when a drill is currently in progress (DrillView mounted). */
  active: boolean;
  setActive: (a: boolean) => void;

  /**
   * DrillView registers its invalidator here on mount so the chat panel can
   * call it without importing DrillView internals.
   */
  registerInvalidator: (fn: () => void) => void;
  unregisterInvalidator: () => void;

  /**
   * Has the user already been warned about the current attempt? Reset to
   * `false` whenever a new drill starts (the warning is per-attempt, not
   * per-session - accidentally hitting "continue" on a previous attempt
   * shouldn't carry forward).
   */
  warningAcknowledged: boolean;
  /** Mark the user as having seen the warning AND invalidate the attempt. */
  acknowledgeAndInvalidate: () => void;
  /** Called by DrillView whenever a fresh attempt starts. */
  resetWarning: () => void;
}

const DrillCtx = createContext<DrillContextValue | null>(null);

export function DrillProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const invalidatorRef = useRef<(() => void) | null>(null);

  const registerInvalidator = useCallback((fn: () => void) => {
    invalidatorRef.current = fn;
  }, []);
  const unregisterInvalidator = useCallback(() => {
    invalidatorRef.current = null;
  }, []);

  const acknowledgeAndInvalidate = useCallback(() => {
    invalidatorRef.current?.();
    setWarningAcknowledged(true);
  }, []);

  const resetWarning = useCallback(() => setWarningAcknowledged(false), []);

  const value = useMemo<DrillContextValue>(
    () => ({
      active,
      setActive,
      registerInvalidator,
      unregisterInvalidator,
      warningAcknowledged,
      acknowledgeAndInvalidate,
      resetWarning,
    }),
    [
      active,
      warningAcknowledged,
      registerInvalidator,
      unregisterInvalidator,
      acknowledgeAndInvalidate,
      resetWarning,
    ],
  );

  return <DrillCtx.Provider value={value}>{children}</DrillCtx.Provider>;
}

export function useDrillContext(): DrillContextValue {
  const v = useContext(DrillCtx);
  if (!v) throw new Error('useDrillContext must be used inside DrillProvider');
  return v;
}
