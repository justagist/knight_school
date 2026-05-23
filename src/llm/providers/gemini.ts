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
interface GeminiResponsePart {
  text?: string;
}

interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GeminiCandidate {
  content?: { parts?: GeminiResponsePart[]; role?: string };
  groundingMetadata?: {
    groundingChunks?: GeminiGroundingChunk[];
    webSearchQueries?: string[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

export const geminiProvider: LLMProvider = {
  id: 'gemini',
  displayName: 'Google Gemini',
  models: MODELS,
  supportsWebSearch: true,
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

  async chat(req: ChatRequest): Promise<ChatResult> {
    // Gemini uses 'model' instead of 'assistant' for its role names.
    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 2048,
        // Gemini 2.5 models have "thinking" enabled by default, which
        // silently consumes maxOutputTokens BEFORE producing visible text —
        // mid-conversation that truncates the response right when the user
        // is reading. We disable thinking for chat (we don't need long
        // chains-of-thought for short conversational replies) by setting
        // thinkingBudget to 0. Visible output now gets the full token cap.
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    if (req.enableWebSearch) {
      // Google Search grounding. Snake_case here matches the REST API.
      body.tools = [{ google_search: {} }];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      req.model,
    )}:generateContent?key=${encodeURIComponent(req.apiKey)}`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      // Gemini uses 429 for free-tier rate limits and 403 with specific
      // quota messages for daily exhaustion. We treat the latter as
      // retryable too since the *next* key may have free budget.
      const isQuotaForbidden =
        resp.status === 403 && /quota|rate/i.test(detail);
      const retryable = resp.status === 429 || isQuotaForbidden;
      throw new LLMError(`HTTP ${resp.status}: ${truncate(detail, 240)}`, {
        status: resp.status,
        retryable,
      });
    }

    const json = (await resp.json()) as GeminiResponse;
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const queries = candidate?.groundingMetadata?.webSearchQueries ?? [];
    const usedWebSearch = groundingChunks.length > 0 || queries.length > 0;
    const citations: ChatCitation[] = [];
    for (const c of groundingChunks) {
      if (c.web?.uri) citations.push({ url: c.web.uri, title: c.web.title });
    }

    return { text, usedWebSearch, citations };
  },
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
