import type { LLMProvider, ModelDescriptor, ProviderInfo, TestResult } from '../types';

const MODELS: ModelDescriptor[] = [
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    hint: 'Higher quality. Free tier daily limit is small.',
    webSearch: true,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    hint: 'Free-tier friendly. Recommended for casual use.',
    webSearch: true,
    default: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    hint: 'Cheapest / fastest. Grounding support varies.',
    webSearch: false,
  },
];

export const geminiInfo: ProviderInfo = {
  blurb:
    'Google Gemini has a free tier suitable for casual use. Get a key at https://aistudio.google.com/apikey. Free-tier rate limits apply — heavy users may want to upgrade or switch providers.',
  apiKeyUrl: 'https://aistudio.google.com/apikey',
  webSearchNote:
    'Web search uses Google Search grounding. Available on most current Gemini models.',
};

/**
 * Gemini REST endpoint. Step 5 only needs a key-validation ping, so we use
 * the lightweight `generateContent` with maxOutputTokens=1.
 *
 * For request shape see https://ai.google.dev/api/generate-content.
 * Authentication: API key as a query string parameter (not a header).
 */
export const geminiProvider: LLMProvider = {
  id: 'gemini',
  displayName: 'Google Gemini',
  models: MODELS,
  defaultModel: () => MODELS.find((m) => m.default)?.id ?? MODELS[0].id,

  async testConnection(apiKey: string, model: string): Promise<TestResult> {
    if (!apiKey.trim()) return { ok: false, message: 'API key is empty.' };
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 1 },
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
