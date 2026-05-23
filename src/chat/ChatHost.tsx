import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ChatPanel } from './ChatPanel';
import { FloatingChatButton } from './FloatingChatButton';
import { ChatContextProvider } from './ChatContextProvider';

interface ChatHostValue {
  /** True when the chat panel is open. */
  open: boolean;
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
 */
export function ChatHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rawPgn, setRawPgn] = useState<string | null>(null);

  const value = useMemo<ChatHostValue>(
    () => ({ open, setOpen, setRawPgn }),
    [open],
  );

  return (
    <ChatHostContext.Provider value={value}>
      <ChatContextProvider>
        {children}
        <FloatingChatButton open={open} onClick={() => setOpen(true)} />
        <ChatPanel rawPgn={rawPgn} open={open} onClose={() => setOpen(false)} />
      </ChatContextProvider>
    </ChatHostContext.Provider>
  );
}

export function useChatHost(): ChatHostValue {
  const v = useContext(ChatHostContext);
  if (!v) throw new Error('useChatHost must be used inside ChatHost');
  return v;
}
