import type { ApiKeyRow, LlmProviderId, ProviderConfigRow } from '../db/db';

/**
 * In-memory store for "session only" API keys.
 *
 * When a user adds a key with the session-only toggle on, we never write
 * it to IndexedDB. This avoids leaving the key resident on the device
 * after the tab is closed - useful on shared devices, or when a user
 * doesn't want a long-lived copy of an org-level key persisted to disk.
 *
 * The store is module-level so all hooks/services see the same map for
 * the lifetime of the page. On reload everything in here vanishes.
 */
const sessionKeys = new Map<string, ApiKeyRow>();
const sessionConfig = new Map<LlmProviderId, ProviderConfigRow>();

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeSessionKeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function putSessionKey(row: ApiKeyRow): void {
  sessionKeys.set(row.id, row);
  emit();
}

export function deleteSessionKey(id: string): boolean {
  const removed = sessionKeys.delete(id);
  // If this key was the session-active for its provider, drop the
  // session config too so callChat falls back to persistent settings.
  for (const [provider, cfg] of sessionConfig) {
    if (cfg.activeKeyId === id) sessionConfig.delete(provider);
  }
  if (removed) emit();
  return removed;
}

export function updateSessionKey(
  id: string,
  patch: Partial<Pick<ApiKeyRow, 'label' | 'apiKey' | 'model'>>,
): boolean {
  const existing = sessionKeys.get(id);
  if (!existing) return false;
  sessionKeys.set(id, { ...existing, ...patch });
  emit();
  return true;
}

export function getSessionKey(id: string): ApiKeyRow | undefined {
  return sessionKeys.get(id);
}

export function listSessionKeys(): ApiKeyRow[] {
  return [...sessionKeys.values()];
}

export function listSessionKeysForProvider(provider: LlmProviderId): ApiKeyRow[] {
  return [...sessionKeys.values()].filter((k) => k.provider === provider);
}

export function setSessionProviderConfig(cfg: ProviderConfigRow): void {
  sessionConfig.set(cfg.provider, cfg);
  emit();
}

export function getSessionProviderConfig(
  provider: LlmProviderId,
): ProviderConfigRow | undefined {
  return sessionConfig.get(provider);
}
