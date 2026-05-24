import type { LlmProviderId } from '../../db/db';
import type { LLMProvider, ProviderInfo } from '../types';
import { anthropicProvider, anthropicInfo } from './anthropic';
import { openaiProvider, openaiInfo } from './openai';
import { geminiProvider, geminiInfo } from './gemini';
import { groqProvider, groqInfo } from './groq';
import { openrouterProvider, openrouterInfo } from './openrouter';

/**
 * Iteration order is the order shown in Settings dropdowns. Groq comes
 * first because it's the most generous free-tier path as of 2026 - no
 * credit card, ~1k requests/day. Then Gemini (also free but more limited),
 * then the paid majors, then OpenRouter as the "extras / model variety"
 * tail option.
 */
export const PROVIDERS: LLMProvider[] = [
  groqProvider,
  geminiProvider,
  anthropicProvider,
  openaiProvider,
  openrouterProvider,
];

const PROVIDER_BY_ID: Record<LlmProviderId, LLMProvider> = {
  groq: groqProvider,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
  openrouter: openrouterProvider,
};

const INFO_BY_ID: Record<LlmProviderId, ProviderInfo> = {
  groq: groqInfo,
  gemini: geminiInfo,
  anthropic: anthropicInfo,
  openai: openaiInfo,
  openrouter: openrouterInfo,
};

export function getProvider(id: LlmProviderId): LLMProvider {
  return PROVIDER_BY_ID[id];
}

export function getProviderInfo(id: LlmProviderId): ProviderInfo {
  return INFO_BY_ID[id];
}
