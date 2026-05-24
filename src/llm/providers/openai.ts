import {
  LLMError,
  type ChatRequest,
  type ChatResult,
  type LLMProvider,
  type ModelDescriptor,
  type ProviderInfo,
  type TestResult,
  type ChatCitation,
} from '../types';
import { safeHttpUrl } from '../../lib/safeUrl';

const MODELS: ModelDescriptor[] = [
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    hint: 'Strong reasoning. Supports web search via the Responses API.',
    webSearch: true,
    default: true,
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    hint: 'Cheaper and faster. Still supports web search.',
    webSearch: true,
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    hint: 'Multimodal generalist. Supports web search.',
    webSearch: true,
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    hint: 'Smallest viable. Web search may be limited.',
    webSearch: false,
  },
];

export const openaiInfo: ProviderInfo = {
  blurb:
    'OpenAI. Requires a model that supports the web_search tool for current chess news. Paid API account; small per-search fee.',
  apiKeyUrl: 'https://platform.openai.com/api-keys',
  webSearchNote:
    'Web search via the Responses API (web_search tool). Only some models support it — check the model picker. Small per-search fee.',
};

interface OpenAIResponsesOutputItem {
  type: string;
  role?: string;
  content?: Array<{
    type: string;
    text?: string;
    annotations?: Array<{
      type: string;
      url?: string;
      title?: string;
    }>;
  }>;
}

interface OpenAIResponsesPayload {
  output?: OpenAIResponsesOutputItem[];
  output_text?: string;
  error?: { message?: string };
}

export const openaiProvider: LLMProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  models: MODELS,
  supportsWebSearch: true,
  defaultModel: () => MODELS.find((m) => m.default)?.id ?? MODELS[0].id,

  async testConnection(apiKey: string, model: string): Promise<TestResult> {
    if (!apiKey.trim()) return { ok: false, message: 'API key is empty.' };
    try {
      // Use chat.completions with max_tokens=1 — minimal cost, validates
      // both the key and model access.
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      if (resp.ok) {
        return { ok: true, message: `Connection OK (${model}).` };
      }

      const text = await resp.text();
      let detail = text;
      try {
        const json = JSON.parse(text) as { error?: { message?: string } };
        if (json.error?.message) detail = json.error.message;
      } catch {}
      return {
        ok: false,
        message: `HTTP ${resp.status}: ${truncate(detail, 240)}`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Network error',
      };
    }
  },

  async chat(req: ChatRequest): Promise<ChatResult> {
    // Responses API is OpenAI's chat-plus-tools surface. We use it
    // unconditionally so web_search support is uniform.
    const input = [
      ...req.messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    const body: Record<string, unknown> = {
      model: req.model,
      instructions: req.system,
      input,
      // See anthropic.ts for the rationale on 2048 — same logic applies.
      max_output_tokens: req.maxTokens ?? 2048,
    };
    if (req.enableWebSearch) {
      body.tools = [{ type: 'web_search' }];
    }

    let resp: Response;
    try {
      resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${req.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      throw new LLMError(err instanceof Error ? err.message : 'Network error', {
        retryable: false,
      });
    }

    if (!resp.ok) {
      const text = await resp.text();
      let detail = text;
      try {
        const json = JSON.parse(text) as { error?: { message?: string } };
        if (json.error?.message) detail = json.error.message;
      } catch {}
      const retryable = resp.status === 429;
      throw new LLMError(`HTTP ${resp.status}: ${truncate(detail, 240)}`, {
        status: resp.status,
        retryable,
      });
    }

    const json = (await resp.json()) as OpenAIResponsesPayload;

    // Prefer the convenience field if present; otherwise scrape output.
    let text = (json.output_text ?? '').trim();
    let usedWebSearch = false;
    const citations: ChatCitation[] = [];

    if (Array.isArray(json.output)) {
      for (const item of json.output) {
        if (item.type === 'web_search_call' || item.type === 'web_search') {
          usedWebSearch = true;
        }
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part.type === 'output_text' && typeof part.text === 'string' && !text) {
              text = part.text.trim();
            }
            if (Array.isArray(part.annotations)) {
              for (const ann of part.annotations) {
                if (ann.type === 'url_citation') {
                  const safe = safeHttpUrl(ann.url);
                  if (safe) {
                    citations.push({ url: safe, title: ann.title });
                    // Citations imply web search was used even when no
                    // explicit web_search_call item is present.
                    usedWebSearch = true;
                  }
                }
              }
            }
          }
        }
      }
    }

    return { text, usedWebSearch, citations };
  },
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
