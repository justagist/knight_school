import type { LlmProviderId } from '../db/db';

export interface ModelDescriptor {
  id: string;
  /** Display name shown in the Settings dropdown. */
  label: string;
  /** Marketing/description blurb (e.g. "Fast and cheap. Best for casual chat."). */
  hint?: string;
  /**
   * Does this model support the provider's built-in web search / grounding
   * tool? Surfaced to the UI so Settings can warn users when their model
   * choice would silently lose news-access capability.
   */
  webSearch: boolean;
  /** When true, mark this as the recommended default for the provider. */
  default?: boolean;
}

export interface TestResult {
  ok: boolean;
  /** Human-readable result message for the UI. */
  message: string;
}

/**
 * Thin abstraction over an LLM provider. Step 5 only implements
 * {@link LLMProvider.testConnection} so the Settings page's Test button
 * works. Step 6 will extend the interface with chat/commentary methods
 * and the chat layer will dispatch through the same registry.
 *
 * Browser-side: each implementation makes a direct fetch() to the provider.
 * No proxy server, no SDK bundle for the provider — keeps the deploy fully
 * static.
 */
export interface LLMProvider {
  id: LlmProviderId;
  displayName: string;
  /** Models available for the user to pick from. */
  models: ModelDescriptor[];
  /** Convenience: provider's default model id. */
  defaultModel(): string;
  /**
   * Make a minimal, cheap API call to validate that {apiKey, model} works.
   * MUST NOT throw — return {ok:false, message} on any error so the UI
   * can render the result uniformly.
   */
  testConnection(apiKey: string, model: string): Promise<TestResult>;
}

/** Info note shown in Settings near the key field, per provider. */
export interface ProviderInfo {
  /** Short blurb shown directly under the provider's section. */
  blurb: string;
  /** Where to get an API key (https URL — opens in a new tab). */
  apiKeyUrl: string;
  /** Detail about the provider's web-search behavior. */
  webSearchNote: string;
}
