import { db, type ApiKeyRow, type LlmProviderId } from '../db/db';
import { getProvider } from './providers';
import { LLMError, type ChatResult, type ChatTurn } from './types';

export interface CallChatArgs {
  /** Provider to use (active for this call). */
  provider: LlmProviderId;
  /** Composed persona + context prompt. */
  system: string;
  /** Conversation history (newest user turn last). */
  messages: ChatTurn[];
  /** Whether to expose the provider's built-in web-search tool. */
  enableWebSearch: boolean;
  /** Cancellation signal. */
  signal?: AbortSignal;
}

export interface CallChatOutcome extends ChatResult {
  /** Which key actually produced this result (after fallback). */
  keyUsed: ApiKeyRow;
  /** Whether we fell back from the user's primary key for this provider. */
  fallbackUsed: boolean;
  /** Keys we tried and failed on (in order). */
  attempted: Array<{ keyId: string; error: string }>;
}

export class NoUsableKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoUsableKeyError';
  }
}

/**
 * Make a chat call, transparently failing over from the active key to other
 * saved keys for the same provider on rate-limit / quota errors.
 *
 * Order of attempts:
 *  1. The provider's currently-active key (per providerConfig).
 *  2. Other saved keys for the same provider, ordered by createdAt — but
 *     only if `fallbackEnabled` is true for the provider.
 *
 * Auth errors (401/403 without a quota signal) surface immediately — the
 * key is just wrong, no point hammering. Network errors surface immediately
 * too: the *network* is the problem, not the key.
 */
export async function callChat(args: CallChatArgs): Promise<CallChatOutcome> {
  const provider = getProvider(args.provider);
  const cfg = await db().providerConfig.get(args.provider);
  if (!cfg?.activeKeyId) {
    throw new NoUsableKeyError(
      `No ${provider.displayName} key is active. Add one in Settings → Elle (LLM).`,
    );
  }
  const fallbackEnabled = cfg.fallbackEnabled !== false;

  const activeKey = await db().apiKeys.get(cfg.activeKeyId);
  if (!activeKey) {
    throw new NoUsableKeyError(
      `Active key not found for ${provider.displayName}. Pick another in Settings.`,
    );
  }

  // Build the candidate-key list: active first, then any others if fallback
  // is enabled. Deduplicate on id so the active key isn't tried twice.
  const candidates: ApiKeyRow[] = [activeKey];
  if (fallbackEnabled) {
    const others = (
      await db().apiKeys.where('provider').equals(args.provider).toArray()
    ).filter((k) => k.id !== activeKey.id);
    candidates.push(...others.sort((a, b) => a.createdAt - b.createdAt));
  }

  const attempted: CallChatOutcome['attempted'] = [];

  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    try {
      const result = await provider.chat({
        apiKey: key.apiKey,
        model: key.model,
        system: args.system,
        messages: args.messages,
        enableWebSearch: args.enableWebSearch,
        signal: args.signal,
      });
      return {
        ...result,
        keyUsed: key,
        fallbackUsed: i > 0,
        attempted,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempted.push({ keyId: key.id, error: message });
      // Retryable across keys: rate-limit / quota. Anything else surfaces.
      if (!(err instanceof LLMError) || !err.retryable) {
        throw err;
      }
    }
  }

  // All retryable errors. Surface the most recent one with context so the
  // user knows the entire pool was rate-limited (not just one key).
  const last = attempted[attempted.length - 1];
  throw new LLMError(
    `All ${candidates.length} ${provider.displayName} key(s) rate-limited. Last error: ${last?.error ?? 'unknown'}`,
    { retryable: true, status: 429 },
  );
}
