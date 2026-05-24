import type { ModelDescriptor, ProviderInfo } from '../types';
import { createOpenAiCompatProvider } from './openaiCompat';

const MODELS: ModelDescriptor[] = [
  {
    id: 'openrouter/auto',
    label: 'Auto-router (free models)',
    hint: 'OpenRouter picks an appropriate free model per request.',
    webSearch: false,
    default: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B (free)',
    hint: 'Strong open-weights model. Subject to free-tier daily caps.',
    webSearch: false,
  },
  {
    id: 'deepseek/deepseek-chat:free',
    label: 'DeepSeek Chat (free)',
    hint: 'Strong reasoning and coding. Free tier with daily caps.',
    webSearch: false,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    label: 'Gemini 2.0 Flash exp (free)',
    hint: 'Google\'s flash model routed via OpenRouter - useful when you\'ve exhausted direct Gemini quota.',
    webSearch: false,
  },
];

export const openrouterProvider = createOpenAiCompatProvider({
  id: 'openrouter',
  displayName: 'OpenRouter',
  baseURL: 'https://openrouter.ai/api/v1',
  models: MODELS,
  // OpenRouter encourages clients to identify themselves; harmless when omitted
  // but improves their rate-limit accounting for our requests.
  extraHeaders: {
    'X-Title': 'KnightSchool',
    'HTTP-Referer': 'https://knightschool.pages.dev',
  },
});

export const openrouterInfo: ProviderInfo = {
  blurb:
    'Free tier - no credit card. ~50 requests/day on free models; rises to ~1,000/day after one-time $10 top-up. Aggregator for many model families. Web search not supported on this provider. Free tier limits can change without notice.',
  apiKeyUrl: 'https://openrouter.ai/keys',
  webSearchNote:
    'OpenRouter does not expose a web-search tool through this client. Elle answers from training knowledge only - no live news, no citations.',
};
