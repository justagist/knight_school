import {
  LLMError,
  type ChatRequest,
  type ChatResult,
  type LLMProvider,
  type ModelDescriptor,
  type TestResult,
} from '../types';
import type { LlmProviderId } from '../../db/db';

/**
 * Factory for OpenAI-compatible providers (Groq, OpenRouter, etc.) that
 * speak the standard `/v1/chat/completions` protocol. The OpenAI provider
 * itself does NOT use this factory — it uses the proprietary
 * `/v1/responses` endpoint for native web-search tool support, which these
 * compatibility services don't expose.
 *
 * Adding a new compat provider is usually:
 *
 *   1. Sign up, copy the base URL (e.g. `https://api.example.com/v1`).
 *   2. Pick a model list (id + label + hint).
 *   3. Drop in a new file: `export const fooProvider = createOpenAiCompatProvider({...})`.
 *   4. Register in providers/index.ts.
 *
 * Web search is unsupported on every compat provider we know of, so the
 * factory hard-codes `supportsWebSearch: false` and silently ignores
 * `enableWebSearch` in chat requests — the chat UI is responsible for
 * hiding the toggle.
 */
export interface OpenAiCompatConfig {
  id: LlmProviderId;
  displayName: string;
  /** Base URL without trailing slash, e.g. `https://api.groq.com/openai/v1`. */
  baseURL: string;
  models: ModelDescriptor[];
  /** Optional extra request headers (e.g. OpenRouter's `HTTP-Referer`). */
  extraHeaders?: Record<string, string>;
  /** Override the "from-the-key" friendly name on errors. Optional. */
  brand?: string;
}

interface OpenAiChatCompletionsPayload {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string };
}

export function createOpenAiCompatProvider(config: OpenAiCompatConfig): LLMProvider {
  const { id, displayName, baseURL, models, extraHeaders } = config;

  const defaultHeaders = (apiKey: string): Record<string, string> => ({
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    ...(extraHeaders ?? {}),
  });

  return {
    id,
    displayName,
    models,
    supportsWebSearch: false,
    defaultModel: () => models.find((m) => m.default)?.id ?? models[0].id,

    async testConnection(apiKey: string, model: string): Promise<TestResult> {
      if (!apiKey.trim()) return { ok: false, message: 'API key is empty.' };
      try {
        const resp = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: defaultHeaders(apiKey),
          body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        if (resp.ok) return { ok: true, message: `Connection OK (${model}).` };
        return { ok: false, message: await formatError(resp) };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Network error',
        };
      }
    },

    async chat(req: ChatRequest): Promise<ChatResult> {
      const messages = [
        { role: 'system' as const, content: req.system },
        ...req.messages.map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
      ];

      const body: Record<string, unknown> = {
        model: req.model,
        messages,
        // 2048 mirrors the cap on Anthropic/OpenAI — enough headroom for
        // multi-paragraph chess explanations without leaving Elle stranded
        // mid-sentence.
        max_tokens: req.maxTokens ?? 2048,
      };
      // We deliberately ignore req.enableWebSearch — these providers don't
      // support a web-search tool, and the chat UI hides the toggle.

      let resp: Response;
      try {
        resp = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: defaultHeaders(req.apiKey),
          body: JSON.stringify(body),
          signal: req.signal,
        });
      } catch (err) {
        throw new LLMError(err instanceof Error ? err.message : 'Network error', {
          retryable: false,
        });
      }

      if (!resp.ok) {
        const detail = await formatError(resp);
        // Rate limits on free tiers (Groq especially) come as 429.
        const retryable = resp.status === 429;
        throw new LLMError(detail, { status: resp.status, retryable });
      }

      const json = (await resp.json()) as OpenAiChatCompletionsPayload;
      const text = (json.choices?.[0]?.message?.content ?? '').trim();
      // Compat providers don't return citations or tool-use signals — flag
      // both as off so the UI doesn't show a misleading "🔎" badge.
      return { text, usedWebSearch: false, citations: [] };
    },
  };
}

async function formatError(resp: Response): Promise<string> {
  const text = await resp.text();
  let detail = text;
  try {
    const json = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof json.error === 'string') detail = json.error;
    else if (json.error?.message) detail = json.error.message;
  } catch {
    // Non-JSON body — keep raw text.
  }
  return `HTTP ${resp.status}: ${truncate(detail, 240)}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
