import type { ModelDescriptor, ProviderInfo } from '../types';
import { createOpenAiCompatProvider } from './openaiCompat';

const MODELS: ModelDescriptor[] = [
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    hint: 'Best free-tier balance — strong reasoning, ~1000 requests/day.',
    webSearch: false,
    default: true,
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B (instant)',
    hint: 'Fastest on Groq. Lower quality but very low latency.',
    webSearch: false,
  },
  {
    id: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B',
    hint: 'Mixture-of-experts. Larger context window (32k).',
    webSearch: false,
  },
];

export const groqProvider = createOpenAiCompatProvider({
  id: 'groq',
  displayName: 'Groq',
  baseURL: 'https://api.groq.com/openai/v1',
  models: MODELS,
});

export const groqInfo: ProviderInfo = {
  blurb:
    'Free tier — no credit card. ~1,000 requests/day on Llama 3.3 70B. Best free option as of May 2026. Web search not supported on this provider. Free tier limits can change without notice.',
  apiKeyUrl: 'https://console.groq.com/keys',
  webSearchNote:
    'Groq does not expose a web-search tool. Elle answers from training knowledge only — no live news, no citations.',
};
