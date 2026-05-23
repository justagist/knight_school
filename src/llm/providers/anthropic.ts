import type { LLMProvider, ModelDescriptor, ProviderInfo, TestResult } from '../types';

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
export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  displayName: 'Anthropic Claude',
  models: MODELS,
  defaultModel: () => MODELS.find((m) => m.default)?.id ?? MODELS[0].id,

  async testConnection(apiKey: string, model: string): Promise<TestResult> {
    if (!apiKey.trim()) return { ok: false, message: 'API key is empty.' };
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Required for browser-origin requests as of mid-2024+.
          'anthropic-dangerous-direct-browser-access': 'true',
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
