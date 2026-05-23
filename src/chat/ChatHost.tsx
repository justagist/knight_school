import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ChatPanel } from './ChatPanel';
import { FloatingChatButton } from './FloatingChatButton';
import { ChatContextProvider } from './ChatContextProvider';
import { useDrillContext } from '../drill/DrillContext';

interface ChatHostValue {
  /** True when the chat panel is open. */
  open: boolean;
  /**
   * Request that the panel open. When a drill is active and the user
   * hasn't yet acknowledged the invalidation warning for this attempt,
   * this routes through the confirmation modal instead.
   */
  setOpen: (b: boolean) => void;
  /** Screens with a loaded game publish the raw PGN here. */
  setRawPgn: (pgn: string | null) => void;
}

const ChatHostContext = createContext<ChatHostValue | null>(null);

/**
 * App-level chat host. Owns the panel open/close state and the
 * "current loaded PGN" — Analyze publishes the PGN it loaded via
 * {@link useChatHost}, and the panel reads it back when the user opens
 * the chat (so a per-game thread is loaded automatically).
 *
 * Also gates the chat panel behind a one-time-per-attempt warning when
 * the user is mid-drill: opening chat invalidates the current drill
 * attempt (it won't count toward stats / scheduling), so we ask first.
 */
export function ChatHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rawPgn, setRawPgn] = useState<string | null>(null);
  const [warningVisible, setWarningVisible] = useState(false);
  const drill = useDrillContext();

  const requestOpen = (next: boolean) => {
    if (!next) {
      setOpen(false);
      return;
    }
    // Trying to open chat. If a drill is active and the user hasn't yet
    // acknowledged the warning for this attempt, show the modal.
    if (drill.active && !drill.warningAcknowledged) {
      setWarningVisible(true);
      return;
    }
    setOpen(true);
  };

  const confirmAndOpen = () => {
    drill.acknowledgeAndInvalidate();
    setWarningVisible(false);
    setOpen(true);
  };

  const cancelWarning = () => setWarningVisible(false);

  const value = useMemo<ChatHostValue>(
    () => ({ open, setOpen: requestOpen, setRawPgn }),
    // requestOpen is intentionally rebuilt each render — it closes over
    // current drill state, which we want fresh on every click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  return (
    <ChatHostContext.Provider value={value}>
      <ChatContextProvider>
        {children}
        <FloatingChatButton open={open} onClick={() => requestOpen(true)} />
        <ChatPanel rawPgn={rawPgn} open={open} onClose={() => setOpen(false)} />
        {warningVisible && (
          <DrillInvalidationModal onCancel={cancelWarning} onConfirm={confirmAndOpen} />
        )}
      </ChatContextProvider>
    </ChatHostContext.Provider>
  );
}

export function useChatHost(): ChatHostValue {
  const v = useContext(ChatHostContext);
  if (!v) throw new Error('useChatHost must be used inside ChatHost');
  return v;
}

/**
 * One-time-per-attempt confirmation: chatting during a drill invalidates
 * the current attempt's stats. We surface this explicitly so a user who
 * just wants to ask Elle a quick question knows the cost.
 */
function DrillInvalidationModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-w-md p-4">
        <h2 className="text-base font-semibold">Open chat during drill?</h2>
        <p className="mt-2 text-sm text-ink-700 dark:text-ink-300">
          Using chat during a drill will invalidate this exercise — it won't
          count toward your progress or scheduling. You can still finish for
          the learning value.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary text-sm">
            Continue and invalidate
          </button>
        </div>
      </div>
    </div>
  );
}
