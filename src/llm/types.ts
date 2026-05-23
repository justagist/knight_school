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
 * One turn in a chat. Roles are kept simple at the abstraction boundary —
 * each provider implementation maps to its native role names ('model' for
 * Gemini, 'assistant' for OpenAI/Anthropic, etc.).
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Inputs to a single chat call. */
export interface ChatRequest {
  apiKey: string;
  model: string;
  /** System / persona prompt. Always supplied; can be a long string. */
  system: string;
  /** Conversation so far. Most recent user turn is at the end. */
  messages: ChatTurn[];
  /** Ask the provider to enable its web-search / grounding tool, if any. */
  enableWebSearch: boolean;
  /** Caller-supplied cancellation hook. */
  signal?: AbortSignal;
  /** Max tokens cap. Falls back to a provider default if omitted. */
  maxTokens?: number;
}

export interface ChatCitation {
  url: string;
  title?: string;
}

/**
 * Output from a chat call. `usedWebSearch` is true if the provider's
 * grounding tool was actually invoked during the response — not just
 * enabled. Surface this to the UI as the "🔎 with web search" indicator.
 */
export interface ChatResult {
  text: string;
  usedWebSearch: boolean;
  citations: ChatCitation[];
}

/**
 * Surfaced when a chat request fails. `retryable` is true when the upstream
 * is rate-limiting (HTTP 429 or provider-specific quota messages) — the
 * orchestration layer uses this signal to try the next saved key. Auth
 * errors (401/403) are NOT retryable: surface immediately so the user can
 * fix the bad key.
 */
export class LLMError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  constructor(message: string, opts: { status?: number; retryable: boolean }) {
    super(message);
    this.name = 'LLMError';
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

/**
 * Thin abstraction over an LLM provider. Each implementation makes direct
 * fetch() calls to the provider's REST API — no proxy server, no SDK bundle,
 * deploy stays fully static.
 *
 * Implementation contract:
 *  - {@link LLMProvider.testConnection} MUST NOT throw (returns TestResult).
 *  - {@link LLMProvider.chat} MAY throw {@link LLMError} for upstream errors;
 *    other exceptions bubble as-is. The orchestrator distinguishes them.
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
  /**
   * Send a chat request. May throw {@link LLMError} (retryable on 429/quota,
   * non-retryable on 401/403). On network failures, throw LLMError with
   * retryable=false. Step 6 caller wraps this with fallback logic.
   */
  chat(req: ChatRequest): Promise<ChatResult>;
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
