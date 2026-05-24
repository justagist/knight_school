import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessageRow } from '../db/db';
import { useChatScreen } from './ChatContextProvider';
import { useChat } from './useChat';
import { useOnline } from '../hooks/useOnline';
import { getProvider } from '../llm/providers';
import type { ScreenContext } from '../llm/personaPrompt';
import { safeHttpUrl } from '../lib/safeUrl';

interface ChatPanelProps {
  rawPgn?: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-in chat overlay. Right-aligned drawer on desktop (≥md), bottom
 * sheet on mobile. Hosted at the App root so it's reachable from every
 * screen via {@link FloatingChatButton}.
 *
 * Mobile sheet height: 50vh by default so the board (the user is trying
 * to discuss) stays visible above the sheet. A "Expand" button in the
 * header bumps the sheet to ~85vh when the user actually wants a full-
 * screen chat. True drag-resize is deferred — toggle covers the common
 * case without the gesture-engine plumbing.
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
  const [expanded, setExpanded] = useState(false);
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

  const activeProviderObj = chat.activeProvider ? getProvider(chat.activeProvider) : null;
  const providerLabel = activeProviderObj?.displayName ?? 'No provider';
  // Compat providers (Groq, OpenRouter) have no web-search tool. Hide the
  // toggle entirely rather than render a confusing disabled state.
  const showWebSearchToggle = activeProviderObj?.supportsWebSearch ?? false;
  const canSend = online && !!chat.activeProvider && !chat.sending && draft.trim().length > 0;
  const inputDisabledReason =
    !online
      ? 'Network not available — chat is paused until you reconnect.'
      : !chat.activeProvider
        ? 'No LLM provider configured. Add a key in Settings → Elle (LLM).'
        : undefined;

  const submit = () => {
    if (!canSend) return;
    const text = draft;
    const useWebSearch = webSearchOn && showWebSearchToggle;
    setDraft('');
    setWebSearchOn(false);
    void chat.send(text, { webSearch: useWebSearch });
  };

  const heightClass = expanded ? 'h-[85vh]' : 'h-[50vh]';
  const breadcrumb = buildBreadcrumb(screen);

  // Empty-state suggestion chips — context-aware so the user gets actionable
  // prompts without having to invent one cold. The "Latest chess news" chip
  // is only useful when the provider supports web search; swap it out for a
  // grounded-in-training prompt when search isn't available.
  const generalSuggestions = showWebSearchToggle
    ? ['Latest chess news', 'Explain a famous opening', 'Help me improve']
    : ['Help me understand a position', 'Explain a famous opening', 'Quiz me on openings'];
  const suggestions: string[] =
    screen.kind === 'game'
      ? ['Explain this position', 'What are the plans here?', 'Show me a critical idea']
      : screen.kind === 'lesson'
        ? ['Summarise this chapter', 'What if I played a different move here?', 'Quiz me on the main idea']
        : screen.kind === 'drill'
          ? ['What\'s the expected move here?', 'Why is that the chapter\'s choice?', 'What if I played something else?']
          : generalSuggestions;

  return (
    <>
      <aside
        className={`fixed inset-x-0 bottom-0 z-50 flex ${heightClass} flex-col rounded-t-xl border-t border-border shadow-xl
                   md:inset-y-0 md:right-0 md:left-auto md:!h-full md:w-[420px] md:rounded-none md:border-l md:border-t-0`}
        style={{ backgroundColor: 'var(--bg-surface-1)' }}
        aria-label="Chat with Elle"
        role="dialog"
      >
        {/* Drag-handle visual cue. Tapping it toggles expanded/half. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mx-auto mt-1 h-1 w-10 cursor-pointer rounded-full bg-muted/40 md:hidden"
          aria-label={expanded ? 'Collapse chat' : 'Expand chat'}
          title={expanded ? 'Tap to collapse' : 'Tap to expand'}
        />

        <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Elle</div>
            <div className="truncate text-[11px] text-muted">{breadcrumb}</div>
            {/* Web-search badge wording per spec:
                  - no provider configured: "Web search disabled · No provider"
                  - provider configured but no web-search support: "… · Groq"
                  - provider supports search: muted "🔍 Search enabled" pill */}
            {!chat.activeProvider ? (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted hover:text-primary"
                title="No LLM provider configured. Tap to set one up."
                onClick={() => {
                  window.location.assign('/settings');
                }}
              >
                <span aria-hidden>🔍</span>
                Web search disabled · No provider
              </button>
            ) : !showWebSearchToggle ? (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted hover:text-primary"
                title="The current provider doesn't expose a web-search tool. Tap to open Settings and switch providers."
                onClick={() => {
                  window.location.assign('/settings');
                }}
              >
                <span aria-hidden>🔍</span>
                Web search disabled · {providerLabel}
              </button>
            ) : (
              <span
                className="mt-1 inline-flex items-center gap-1 rounded-md bg-best/15 px-1.5 py-0.5 text-[10px] text-best"
                title={`${providerLabel} supports web search — toggle it per message below.`}
              >
                <span aria-hidden>🔍</span>
                Search available
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {/* The mobile expand/collapse affordance lives on the drag
                handle at the top of the sheet (just above this header).
                A second ▼/▲ button used to live here but rendered with
                `hidden md:hidden` (i.e. always hidden) — removed rather
                than fixed, since the drag handle covers the same job. */}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary"
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
              aria-label="Clear this thread"
            >
              {/* Trash glyph — differentiates from Close so the user can't
                  mistake destroy for minimise. */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary"
              onClick={onClose}
              aria-label="Minimise chat"
              title="Minimise"
            >
              {/* Chevron-down reads as 'minimise', not 'delete'. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
          {chat.messages.length === 0 && (
            <EmptyState
              kind={screen.kind}
              suggestions={suggestions}
              onPick={(s) => {
                if (!inputDisabledReason) {
                  void chat.send(s, { webSearch: false });
                }
              }}
              inputDisabledReason={inputDisabledReason}
            />
          )}
          {chat.messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
          {chat.sending && <TypingIndicator />}
        </div>

        <form
          className="border-t border-border p-3"
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
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
            {showWebSearchToggle ? (
              <button
                type="button"
                onClick={() => setWebSearchOn((on) => !on)}
                disabled={!!inputDisabledReason}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  webSearchOn
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border text-muted hover:text-primary'
                } disabled:opacity-40`}
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
            ) : (
              <span aria-hidden /> /* eats the flex slot so Send stays right-aligned */
            )}
            <button
              type="submit"
              className="btn-primary text-xs"
              disabled={!canSend}
              title={inputDisabledReason}
            >
              {chat.sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div className="mt-1 text-[10px] text-muted">
            Enter to send · Shift+Enter for newline
          </div>
        </form>
      </aside>
    </>
  );
}

/**
 * One-line breadcrumb shown under "Elle" in the header.
 * Strips PGN date placeholders (`1858.??.??` → `1858`) so the game header
 * doesn't read as a corrupted date.
 */
function buildBreadcrumb(screen: ScreenContext): string {
  if (screen.kind === 'game') {
    return tidyGameLabel(screen.gameLabel || 'Game');
  }
  if (screen.kind === 'lesson') {
    if (screen.lesson) return `${screen.lesson.studyName} · ${screen.lesson.chapterTitle}`;
    return 'Lesson';
  }
  if (screen.kind === 'drill') {
    if (screen.drill) return `${screen.drill.kindLabel} · ${screen.drill.studyName}`;
    return 'Drill';
  }
  return 'General';
}

function tidyGameLabel(label: string): string {
  // 1858.??.?? → 1858, 1858.07.?? → 1858, 1858.07.21 → 1858.07.21 (left alone).
  return label.replace(/(\d{4})(?:\.[?\d]{2}){1,2}/g, (full, year) => {
    return full.includes('?') ? year : full;
  });
}

function ChatBubble({ message }: { message: ChatMessageRow }) {
  const isUser = message.role === 'user';
  const [modelExpanded, setModelExpanded] = useState(false);
  if (message.errorMessage) {
    return (
      <div className="rounded-md border border-blunder/40 bg-blunder/10 px-3 py-2 text-xs text-blunder">
        {message.errorMessage}
      </div>
    );
  }
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser ? 'bg-secondary text-white' : 'bg-surface-2 text-primary'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {!isUser && (message.usedWebSearch || message.provider) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
            {message.usedWebSearch && (
              <span title="This response used the provider's web search tool.">
                🔎 with web search
              </span>
            )}
            {message.provider && (
              <button
                type="button"
                onClick={() => setModelExpanded((v) => !v)}
                className="hover:text-primary"
                title={modelExpanded ? 'Hide model name' : 'Show model name'}
              >
                via {prettyProvider(message.provider)}
                {modelExpanded && message.model && <> ({message.model})</>}
              </button>
            )}
          </div>
        )}
        {message.citations && message.citations.length > 0 && (() => {
          // Defense in depth: providers already filter at ingest, but old
          // rows in IndexedDB may pre-date that filter — re-check here so
          // a stored `javascript:`/`data:` URL can never become an href.
          const safe: Array<{ url: string; title?: string }> = [];
          for (const c of message.citations) {
            const u = safeHttpUrl(c.url);
            if (u) safe.push({ url: u, title: c.title });
            if (safe.length === 5) break;
          }
          if (safe.length === 0) return null;
          return (
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {safe.map((c, i) => (
                <li key={`${c.url}-${i}`} className="truncate">
                  <a
                    href={c.url}
                    className="text-secondary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.title || c.url}
                  </a>
                </li>
              ))}
            </ul>
          );
        })()}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <span className="sr-only">Elle is typing</span>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </div>
    </div>
  );
}
function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="block h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden
    />
  );
}

function EmptyState({
  kind,
  suggestions,
  onPick,
  inputDisabledReason,
}: {
  kind: ScreenContext['kind'];
  suggestions: string[];
  onPick: (s: string) => void;
  inputDisabledReason: string | undefined;
}) {
  const intro = useMemo(() => {
    if (kind === 'game') return 'Ask Elle about this game — moves, plans, ideas, theory.';
    if (kind === 'lesson') return 'Ask Elle about the chapter — main ideas, alternatives, "what if?" questions.';
    return 'Ask Elle anything chess-related.';
  }, [kind]);
  return (
    <div className="space-y-3 text-center text-xs text-muted">
      <p>{intro}</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            disabled={!!inputDisabledReason}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function prettyProvider(p: string): string {
  if (p === 'anthropic') return 'Anthropic';
  if (p === 'openai') return 'OpenAI';
  if (p === 'gemini') return 'Gemini';
  if (p === 'groq') return 'Groq';
  if (p === 'openrouter') return 'OpenRouter';
  return p;
}
