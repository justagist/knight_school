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

const MODELS: ModelDescriptor[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    hint: 'Most capable. Higher cost.',
    webSearch: true,
    default: true,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    hint: 'Balanced cost / quality.',
    webSearch: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    hint: 'Fast and cheap.',
    webSearch: true,
  },
];

export const anthropicInfo: ProviderInfo = {
  blurb:
    'Anthropic Claude. Paid API account required (a small minimum credit balance). Get a key at https://console.anthropic.com.',
  apiKeyUrl: 'https://console.anthropic.com/settings/keys',
  webSearchNote:
    'Web search is enabled on most current Claude models. Small per-search fee applies.',
};

/**
 * Anthropic Messages API. Step 5 uses this only for testConnection().
 * A tiny ping with max_tokens=1 is enough to validate that the key works
 * for the picked model without burning meaningful credit.
 *
 * Browser-direct: this hits the public REST endpoint. The Anthropic SDK
 * exists but bundling it would balloon the build for a feature we drive
 * with a single fetch.
 */
const HEADERS = (apiKey: string) => ({
  'content-type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
  // Required for browser-origin requests as of mid-2024+.
  'anthropic-dangerous-direct-browser-access': 'true',
});

interface AnthropicContentBlock {
  type: string;
  text?: string;
  url?: string;
  title?: string;
  content?: AnthropicContentBlock[];
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  error?: { message?: string };
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  displayName: 'Anthropic Claude',
  models: MODELS,
  supportsWebSearch: true,
  defaultModel: () => MODELS.find((m) => m.default)?.id ?? MODELS[0].id,

  async testConnection(apiKey: string, model: string): Promise<TestResult> {
    if (!apiKey.trim()) return { ok: false, message: 'API key is empty.' };
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: HEADERS(apiKey),
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
    const body: Record<string, unknown> = {
      model: req.model,
      // Bumped from 1024 → 2048: explanations that walk through tactical
      // lines (refutation + counterfactual SAN sequences) routinely run
      // past 1k tokens for Elle, and a mid-sentence cutoff is worse than
      // a marginally pricier call.
      max_tokens: req.maxTokens ?? 2048,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (req.enableWebSearch) {
      // server_tool — Anthropic web_search. The model id of the tool maps to
      // a particular implementation version on Anthropic's side.
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
        },
      ];
    }

    let resp: Response;
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: HEADERS(req.apiKey),
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      // Network failure — treat as non-retryable so the orchestrator surfaces
      // it instead of cycling through every key on the same dead network.
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
      // 429: rate-limit. 529: Anthropic-specific overloaded. Retry across keys.
      const retryable = resp.status === 429 || resp.status === 529;
      throw new LLMError(`HTTP ${resp.status}: ${truncate(detail, 240)}`, {
        status: resp.status,
        retryable,
      });
    }

    const json = (await resp.json()) as AnthropicResponse;
    const blocks = json.content ?? [];

    // Concatenate text content blocks. Tool blocks (web_search_tool_use /
    // web_search_tool_result) are non-text and don't contribute to display.
    const text = blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    // Web search detection — presence of a server_tool_use block typed
    // web_search means the tool was invoked. Citations come from the
    // result block's `content` array (each item carries url + title).
    const usedWebSearch = blocks.some(
      (b) =>
        (b.type === 'server_tool_use' || b.type === 'web_search_tool_use') ||
        b.type === 'web_search_tool_result',
    );

    const citations: ChatCitation[] = [];
    for (const b of blocks) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const inner of b.content) {
          if (inner.url) citations.push({ url: inner.url, title: inner.title });
        }
      }
    }

    return { text, usedWebSearch, citations };
  },
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
