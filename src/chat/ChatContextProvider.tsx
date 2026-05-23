import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ScreenContext } from '../llm/personaPrompt';

interface ChatContextValue {
  /** Current screen context for Elle. Default: idle/general chat. */
  screen: ScreenContext;
  /**
   * Components hosting a context (e.g. AnalyzeView with a loaded game) call
   * this to publish what's on screen. Unmounting or passing kind='idle'
   * reverts to the general thread.
   */
  setScreen: (ctx: ScreenContext) => void;
}

const ChatScreenContext = createContext<ChatContextValue | null>(null);

const IDLE: ScreenContext = { kind: 'idle' };

/**
 * Wraps the app and lets any screen publish a {@link ScreenContext}.
 * The chat panel reads the current value to know whether it's in a
 * per-game thread, a lesson, or the general one.
 */
export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<ScreenContext>(IDLE);
  const value = useMemo(() => ({ screen, setScreen }), [screen]);
  return <ChatScreenContext.Provider value={value}>{children}</ChatScreenContext.Provider>;
}

export function useChatScreen(): ChatContextValue {
  const v = useContext(ChatScreenContext);
  if (!v) throw new Error('useChatScreen must be used inside ChatContextProvider');
  return v;
}
