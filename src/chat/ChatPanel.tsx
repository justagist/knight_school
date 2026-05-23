import { useEffect, useRef, useState } from 'react';
import type { ChatMessageRow } from '../db/db';
import { useChatScreen } from './ChatContextProvider';
import { useChat } from './useChat';
import { useOnline } from '../hooks/useOnline';
import { getProvider } from '../llm/providers';

interface ChatPanelProps {
  rawPgn?: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-in chat overlay. Right-aligned drawer on desktop (≥md), bottom
 * sheet on mobile. Hosted at the App root so it's reachable from every
 * screen via {@link FloatingChatButton}.
 */
export function ChatPanel({ rawPgn, open, onClose }: ChatPanelProps) {
  const { screen } = useChatScreen();
  const chat = useChat({ screen, rawPgn });
  const online = useOnline();
  const [draft, setDraft] = useState('');
  // Web search is opt-in per message. Resets to off after each send so users
  // can't accidentally web-search every future message; they have to flip
  // it back on if they want fresh info on a follow-up.
  const [webSearchOn, setWebSearchOn] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive.
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat.messages.length, open]);

  // Esc closes the panel. Skipped when the user is typing in the textarea —
  // they might want Esc to clear the field in some browsers, and we don't
  // want to fight that.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') return;
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const providerLabel = chat.activeProvider
    ? getProvider(chat.activeProvider).displayName
    : 'No provider';
  const threadLabel = screen.kind === 'game' ? screen.gameLabel || 'Game' : 'General';
  const canSend = online && !!chat.activeProvider && !chat.sending && draft.trim().length > 0;
  const inputDisabledReason =
    !online
      ? 'You are offline — chat is unavailable until you reconnect.'
      : !chat.activeProvider
        ? 'No LLM provider configured. Add a key in Settings → Elle (LLM).'
        : undefined;

  const submit = () => {
    if (!canSend) return;
    const text = draft;
    const useWebSearch = webSearchOn;
    setDraft('');
    setWebSearchOn(false);
    void chat.send(text, { webSearch: useWebSearch });
  };

  return (
    <>
      {/*
        No backdrop on either platform. The chat panel is a bottom sheet on
        mobile (50vh) and a right drawer on desktop (420px); in both shapes
        the rest of the page stays fully interactive — the user wants to
        drag pieces and read replies at the same time. Dismiss via the
        X button or the Esc key.
      */}
      <aside
        className="fixed inset-x-0 bottom-0 z-50 flex h-[50vh] flex-col rounded-t-xl border-t border-ink-200 bg-white shadow-xl
                   dark:border-ink-800 dark:bg-ink-950
                   md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-[420px] md:rounded-none md:border-l md:border-t-0"
        aria-label="Chat with Elle"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-3 py-2 dark:border-ink-800">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Elle</div>
            <div className="truncate text-[11px] text-ink-500 dark:text-ink-400">
              {threadLabel} · {providerLabel}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={async () => {
                if (
                  window.confirm(
                    'Clear this conversation? Your other chat threads are unaffected.',
                  )
                ) {
                  await chat.clear();
                }
              }}
              title="Clear this thread"
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={onClose}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
          {chat.messages.length === 0 && (
            <div className="text-center text-xs text-ink-500 dark:text-ink-400">
              {screen.kind === 'game'
                ? 'Ask Elle about this game — moves, plans, ideas, theory.'
                : 'Ask Elle anything chess-related.'}
            </div>
          )}
          {chat.messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
          {chat.sending && (
            <div className="rounded-md bg-ink-100 px-3 py-2 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              Elle is typing…
            </div>
          )}
        </div>

        <form
          className="border-t border-ink-200 p-3 dark:border-ink-800"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            className="input min-h-[60px] text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={inputDisabledReason ?? 'Ask Elle anything chess-related…'}
            disabled={!!inputDisabledReason}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-500 dark:text-ink-400">
            <button
              type="button"
              onClick={() => setWebSearchOn((on) => !on)}
              disabled={!!inputDisabledReason}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                webSearchOn
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-ink-200 text-ink-500 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-400 dark:hover:bg-ink-800'
              }`}
              title={
                webSearchOn
                  ? 'Web search enabled for the next message. Click to disable.'
                  : 'Enable web search for the next message. Off by default — Elle relies on training knowledge unless you turn this on.'
              }
              aria-pressed={webSearchOn}
            >
              <span aria-hidden="true">🔎</span>
              <span>Web search {webSearchOn ? 'on' : 'off'}</span>
            </button>
            <button
              type="submit"
              className="btn-primary text-xs"
              disabled={!canSend}
              title={inputDisabledReason}
            >
              {chat.sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div className="mt-1 text-[10px] text-ink-500 dark:text-ink-400">
            Enter to send · Shift+Enter for newline
          </div>
        </form>
      </aside>
    </>
  );
}

function ChatBubble({ message }: { message: ChatMessageRow }) {
  const isUser = message.role === 'user';
  if (message.errorMessage) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {message.errorMessage}
      </div>
    );
  }
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-100'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {!isUser && (message.usedWebSearch || message.provider) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-ink-500 dark:text-ink-400">
            {message.usedWebSearch && (
              <span title="This response used the provider's web search tool.">
                🔎 with web search
              </span>
            )}
            {message.provider && message.model && (
              <span>
                via {prettyProvider(message.provider)} ({message.model})
              </span>
            )}
          </div>
        )}
        {message.citations && message.citations.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {message.citations.slice(0, 5).map((c, i) => (
              <li key={`${c.url}-${i}`} className="truncate">
                <a
                  href={c.url}
                  className="text-sky-700 hover:underline dark:text-sky-400"
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.title || c.url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function prettyProvider(p: string): string {
  if (p === 'anthropic') return 'Anthropic';
  if (p === 'openai') return 'OpenAI';
  if (p === 'gemini') return 'Gemini';
  return p;
}
