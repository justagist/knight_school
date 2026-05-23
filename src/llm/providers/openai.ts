import type { LLMProvider, ModelDescriptor, ProviderInfo, TestResult } from '../types';

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

export const openaiProvider: LLMProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  models: MODELS,
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
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
