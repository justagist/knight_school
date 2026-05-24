import { db, type ApiKeyRow, type LlmProviderId, type ProviderConfigRow, type LlmGlobalRow } from './db';
import { uuid } from '../lib/uuid';
import {
  deleteSessionKey,
  getSessionKey,
  getSessionProviderConfig,
  listSessionKeys,
  listSessionKeysForProvider,
  putSessionKey,
  setSessionProviderConfig,
  updateSessionKey,
} from '../llm/sessionKeyStore';

/** Fired when any LLM-key / provider-config mutation lands so views can
 *  refresh without per-keystroke polling. */
export const LLM_CHANGED_EVENT = 'ks-llm-changed';

function notifyLlmChanged(): void {
  window.dispatchEvent(new Event(LLM_CHANGED_EVENT));
}

export function subscribeLlmChanges(listener: () => void): () => void {
  window.addEventListener(LLM_CHANGED_EVENT, listener);
  return () => window.removeEventListener(LLM_CHANGED_EVENT, listener);
}

export interface NewApiKey {
  provider: LlmProviderId;
  label: string;
  apiKey: string;
  model: string;
  /** When true, the key is held in memory only and never persisted to
   *  IndexedDB. Used by the "session only" toggle on the Add Key form
   *  so a key vanishes when the tab closes. */
  sessionOnly?: boolean;
}

/**
 * Insert a new API key. If it's the first key for its provider, also mark it
 * as the active key for that provider (so the user doesn't have to take an
 * extra step in the common "I just added my one key" case).
 */
export async function addApiKey(input: NewApiKey): Promise<ApiKeyRow> {
  const row: ApiKeyRow = {
    id: uuid(),
    provider: input.provider,
    label: input.label.trim() || 'Untitled',
    apiKey: input.apiKey,
    model: input.model,
    createdAt: Date.now(),
  };
  if (input.sessionOnly) {
    // Memory-only: never touches Dexie. Also auto-activate if neither
    // a persistent nor a session active key already covers this provider.
    putSessionKey(row);
    const persistent = await db().providerConfig.get(input.provider);
    const session = getSessionProviderConfig(input.provider);
    const hasActive = !!persistent?.activeKeyId || !!session?.activeKeyId;
    if (!hasActive) {
      setSessionProviderConfig({
        provider: input.provider,
        activeKeyId: row.id,
        fallbackEnabled: persistent?.fallbackEnabled ?? true,
      });
    }
    notifyLlmChanged();
    return row;
  }
  await db().transaction('rw', db().apiKeys, db().providerConfig, async () => {
    await db().apiKeys.add(row);
    const cfg = await db().providerConfig.get(input.provider);
    if (!cfg) {
      await db().providerConfig.put({
        provider: input.provider,
        activeKeyId: row.id,
        fallbackEnabled: true,
      });
    } else if (!cfg.activeKeyId) {
      await db().providerConfig.put({ ...cfg, activeKeyId: row.id });
    }
  });
  notifyLlmChanged();
  return row;
}

export async function updateApiKey(
  id: string,
  patch: Partial<Pick<ApiKeyRow, 'label' | 'apiKey' | 'model'>>,
): Promise<void> {
  if (updateSessionKey(id, patch)) {
    notifyLlmChanged();
    return;
  }
  await db().apiKeys.update(id, patch);
  notifyLlmChanged();
}

/**
 * Delete a key. If it was active for its provider, clear the activeKeyId
 * (UI surfaces the "no key configured" state — user can pick another).
 */
export async function deleteApiKey(id: string): Promise<void> {
  if (deleteSessionKey(id)) {
    notifyLlmChanged();
    return;
  }
  await db().transaction('rw', db().apiKeys, db().providerConfig, async () => {
    const row = await db().apiKeys.get(id);
    if (!row) return;
    await db().apiKeys.delete(id);
    const cfg = await db().providerConfig.get(row.provider);
    if (cfg && cfg.activeKeyId === id) {
      // Try to fall back to another saved key for the same provider.
      const remaining = await db().apiKeys.where('provider').equals(row.provider).toArray();
      const nextActive = remaining[0]?.id ?? null;
      await db().providerConfig.put({ ...cfg, activeKeyId: nextActive });
    }
  });
  notifyLlmChanged();
}

export async function setActiveKey(
  provider: LlmProviderId,
  keyId: string | null,
): Promise<void> {
  // If activating a session-only key, keep the activation in the
  // session store so we don't persist a dangling id to Dexie.
  if (keyId && getSessionKey(keyId)) {
    const persistent = await db().providerConfig.get(provider);
    setSessionProviderConfig({
      provider,
      activeKeyId: keyId,
      fallbackEnabled: persistent?.fallbackEnabled ?? true,
    });
    notifyLlmChanged();
    return;
  }
  const cfg = (await db().providerConfig.get(provider)) ?? {
    provider,
    activeKeyId: null,
    fallbackEnabled: true,
  };
  await db().providerConfig.put({ ...cfg, activeKeyId: keyId });
  // Switching away from a session-key clears the session activation.
  const session = getSessionProviderConfig(provider);
  if (session) {
    setSessionProviderConfig({ ...session, activeKeyId: null });
  }
  notifyLlmChanged();
}

export async function setFallbackEnabled(
  provider: LlmProviderId,
  enabled: boolean,
): Promise<void> {
  const cfg = (await db().providerConfig.get(provider)) ?? {
    provider,
    activeKeyId: null,
    fallbackEnabled: true,
  };
  await db().providerConfig.put({ ...cfg, fallbackEnabled: enabled });
  notifyLlmChanged();
}

export async function setActiveProvider(provider: LlmProviderId | null): Promise<void> {
  await db().llmGlobal.put({ id: 'singleton', activeProvider: provider });
  notifyLlmChanged();
}

export async function getAllApiKeys(): Promise<ApiKeyRow[]> {
  const persistent = await db().apiKeys.orderBy('createdAt').toArray();
  const session = listSessionKeys();
  // Stable order: by createdAt, session + persistent merged. UI dedupes
  // on id; session keys are visually flagged via `sessionOnly` lookup.
  return [...persistent, ...session].sort((a, b) => a.createdAt - b.createdAt);
}

/** True iff the given id refers to a memory-only session key. */
export function isSessionOnlyKey(id: string): boolean {
  return getSessionKey(id) !== undefined;
}

export async function getApiKey(id: string): Promise<ApiKeyRow | undefined> {
  const session = getSessionKey(id);
  if (session) return session;
  return db().apiKeys.get(id);
}

export async function getProviderConfig(
  provider: LlmProviderId,
): Promise<ProviderConfigRow | undefined> {
  // Session config overrides persistent when present — supports
  // "activate this session key" without persisting the id to Dexie.
  const session = getSessionProviderConfig(provider);
  const persistent = await db().providerConfig.get(provider);
  if (session?.activeKeyId) return session;
  return persistent;
}

/** All keys (session + persistent) for a single provider. Used by
 *  callChat to build the fallback chain. */
export async function getKeysForProvider(
  provider: LlmProviderId,
): Promise<ApiKeyRow[]> {
  const persistent = await db().apiKeys.where('provider').equals(provider).toArray();
  const session = listSessionKeysForProvider(provider);
  const seen = new Set<string>();
  const merged: ApiKeyRow[] = [];
  for (const k of [...persistent, ...session]) {
    if (seen.has(k.id)) continue;
    seen.add(k.id);
    merged.push(k);
  }
  return merged.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getLlmGlobal(): Promise<LlmGlobalRow | undefined> {
  return db().llmGlobal.get('singleton');
}

/**
 * Record a test-connection outcome on the key row. Stored so the multi-key
 * list can show "Tested 2 min ago — ok" etc. without re-running the test on
 * every render.
 */
export async function recordKeyTest(
  id: string,
  status: 'ok' | 'error',
  message?: string,
): Promise<void> {
  const patch = {
    lastTestedAt: Date.now(),
    lastTestStatus: status,
    lastTestMessage: message,
  };
  const session = getSessionKey(id);
  if (session) {
    putSessionKey({ ...session, ...patch });
    notifyLlmChanged();
    return;
  }
  await db().apiKeys.update(id, patch);
  notifyLlmChanged();
}
