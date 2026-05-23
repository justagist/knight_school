import type { LlmProviderId } from '../../db/db';
import type { LLMProvider, ProviderInfo } from '../types';
import { anthropicProvider, anthropicInfo } from './anthropic';
import { openaiProvider, openaiInfo } from './openai';
import { geminiProvider, geminiInfo } from './gemini';

/** Iteration order is the order shown in Settings dropdowns. */
export const PROVIDERS: LLMProvider[] = [
  // Gemini first because it's the free-tier-friendly default we recommend
  // for new users (per the spec addendum).
  geminiProvider,
  anthropicProvider,
  openaiProvider,
];

const PROVIDER_BY_ID: Record<LlmProviderId, LLMProvider> = {
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

const INFO_BY_ID: Record<LlmProviderId, ProviderInfo> = {
  gemini: geminiInfo,
  anthropic: anthropicInfo,
  openai: openaiInfo,
};

export function getProvider(id: LlmProviderId): LLMProvider {
  return PROVIDER_BY_ID[id];
}

export function getProviderInfo(id: LlmProviderId): ProviderInfo {
  return INFO_BY_ID[id];
}
