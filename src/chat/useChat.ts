import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { callChat, NoUsableKeyError } from '../llm/callChat';
import { buildSystemPrompt, type ScreenContext } from '../llm/personaPrompt';
import { preprocessChat } from '../llm/preprocessChat';
import { LLMError, type ChatTurn } from '../llm/types';
import { useSettings } from '../settings/SettingsProvider';
import {
  appendMessage,
  clearThreadMessages,
  ensureGameThread,
  ensureGeneralThread,
  listMessages,
  pgnHash,
} from '../db/chat';
import { getLlmGlobal, subscribeLlmChanges } from '../db/apiKeys';
import type { ChatMessageRow, ChatThreadRow, LlmProviderId } from '../db/db';

export interface SendOptions {
  /** Whether to expose the provider's web-search tool for this message. */
  webSearch?: boolean;
}

export interface UseChatReturn {
  thread: ChatThreadRow | null;
  messages: ChatMessageRow[];
  /** True while the assistant call is in flight. */
  sending: boolean;
  /** Send a new user message; persists user + assistant turns. */
  send: (text: string, options?: SendOptions) => Promise<void>;
  /** Wipe this thread's history. */
  clear: () => Promise<void>;
  /** Active provider when the user opened the panel; null if none configured. */
  activeProvider: LlmProviderId | null;
}

interface UseChatArgs {
  screen: ScreenContext;
  /** When true, build the per-game thread bound to the PGN hash. */
  rawPgn?: string | null;
}

/**
 * Owns a single chat thread (general or per-game) and persists every turn
 * to Dexie. The screen context is baked into the system prompt at send-time
 * so any subsequent screen changes only affect future messages.
 */
export function useChat({ screen, rawPgn }: UseChatArgs): UseChatReturn {
  const { settings } = useSettings();
  const [thread, setThread] = useState<ChatThreadRow | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [sending, setSending] = useState(false);
  const [activeProvider, setActiveProvider] = useState<LlmProviderId | null>(null);
  // Generation token so a stale send() doesn't write into a new thread.
  const threadGenRef = useRef(0);

  // Resolve which thread to load whenever the screen / game changes.
  useEffect(() => {
    let cancelled = false;
    threadGenRef.current += 1;
    const gen = threadGenRef.current;
    // Thread switch invalidates any in-flight send for the previous
    // thread - drop the sending flag so the new thread's input isn't
    // locked behind a request the user no longer cares about.
    setSending(false);

    (async () => {
      let t: ChatThreadRow;
      if (screen.kind === 'game' && rawPgn) {
        const id = pgnHash(rawPgn);
        const title = screen.gameLabel ?? 'Game chat';
        t = await ensureGameThread(id, title);
      } else {
        t = await ensureGeneralThread();
      }
      if (cancelled || threadGenRef.current !== gen) return;
      const msgs = await listMessages(t.id);
      setThread(t);
      setMessages(msgs);
    })();

    return () => {
      cancelled = true;
    };
  }, [screen.kind, screen.gameLabel, rawPgn]);

  // Track current active provider so the panel header can display it.
  // Refresh on the explicit `ks-llm-changed` event rather than on every
  // keystroke / send - the previous [messages, sending] deps re-read
  // Dexie on every input change.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const g = await getLlmGlobal();
      if (!cancelled) setActiveProvider(g?.activeProvider ?? null);
    };
    void read();
    const unsubscribe = subscribeLlmChanges(() => {
      void read();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const send = useCallback(
    async (text: string, options?: SendOptions) => {
      const trimmed = text.trim();
      if (!trimmed || !thread || sending) return;

      const gen = threadGenRef.current;
      const provider = await (async () => {
        const g = await getLlmGlobal();
        return g?.activeProvider ?? null;
      })();
      if (!provider) {
        await appendMessage({
          threadId: thread.id,
          role: 'assistant',
          content: '',
          errorMessage: 'No active provider. Pick one in Settings → Elle (LLM).',
        });
        setMessages(await listMessages(thread.id));
        return;
      }

      // 1. Persist the user turn so it shows immediately even if the request
      //    is slow.
      await appendMessage({ threadId: thread.id, role: 'user', content: trimmed });
      setMessages(await listMessages(thread.id));
      setSending(true);

      try {
        // 2. Compose history for the model. Strip past errors - they only
        //    exist for UI display.
        const history = (await listMessages(thread.id))
          .filter((m) => !m.errorMessage)
          .map<ChatTurn>((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          }));

        // 3. Pre-flight candidate-move probe: if the user's message
        //    references specific moves ("would Nf3 work?", "why not
        //    castle short?"), parse them out + run Stockfish on each
        //    resulting position so Elle's answer can quote real engine
        //    numbers instead of guessing. Cache hits return instantly;
        //    misses block on the engine for a few seconds at the user's
        //    analysisDepth. Block is appended to the system prompt
        //    only for this message.
        let system = buildSystemPrompt(screen);
        try {
          const block = await preprocessChat(screen, trimmed, {
            depth: settings.analysisDepth,
            engineVariant: settings.engineVariant,
          });
          if (block) system = `${system}\n\n${block}`;
        } catch {
          // Probe failure is non-fatal - send the unmodified prompt.
        }
        if (threadGenRef.current !== gen) return; // user switched threads mid-probe

        const result = await callChat({
          provider,
          system,
          messages: history,
          // Web search is OFF by default; user opts in per-message via the
          // 🔎 toggle in the chat input. Tools that aren't requested are not
          // exposed to the model, so it can't decide to search on its own.
          enableWebSearch: options?.webSearch === true,
        });

        if (threadGenRef.current !== gen) return; // user switched threads mid-send

        await appendMessage({
          threadId: thread.id,
          role: 'assistant',
          content: result.text || '(empty response)',
          provider: result.keyUsed.provider,
          model: result.keyUsed.model,
          keyId: result.keyUsed.id,
          usedWebSearch: result.usedWebSearch,
          citations: result.citations.length > 0 ? result.citations : undefined,
        });
        setMessages(await listMessages(thread.id));
      } catch (err) {
        if (threadGenRef.current !== gen) return;
        const errorMessage = formatChatError(err);
        await appendMessage({
          threadId: thread.id,
          role: 'assistant',
          content: '',
          errorMessage,
        });
        setMessages(await listMessages(thread.id));
      } finally {
        // Always clear the in-flight flag, even if the user switched
        // threads mid-request. Stale-write protection happens earlier
        // via the threadGenRef check before each appendMessage; leaving
        // sending=true here strands the input forever.
        setSending(false);
      }
    },
    [thread, sending, screen, settings.analysisDepth, settings.engineVariant],
  );

  const clear = useCallback(async () => {
    if (!thread) return;
    await clearThreadMessages(thread.id);
    setMessages([]);
  }, [thread]);

  return useMemo(
    () => ({ thread, messages, sending, send, clear, activeProvider }),
    [thread, messages, sending, send, clear, activeProvider],
  );
}

function formatChatError(err: unknown): string {
  if (err instanceof NoUsableKeyError) return err.message;
  if (err instanceof LLMError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
