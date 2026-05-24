import { db, type ApiKeyRow, type LlmProviderId, type ProviderConfigRow, type LlmGlobalRow } from './db';
import { uuid } from '../lib/uuid';

export interface NewApiKey {
  provider: LlmProviderId;
  label: string;
  apiKey: string;
  model: string;
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
  return row;
}

export async function updateApiKey(
  id: string,
  patch: Partial<Pick<ApiKeyRow, 'label' | 'apiKey' | 'model'>>,
): Promise<void> {
  await db().apiKeys.update(id, patch);
}

/**
 * Delete a key. If it was active for its provider, clear the activeKeyId
 * (UI surfaces the "no key configured" state — user can pick another).
 */
export async function deleteApiKey(id: string): Promise<void> {
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
}

export async function setActiveKey(
  provider: LlmProviderId,
  keyId: string | null,
): Promise<void> {
  const cfg = (await db().providerConfig.get(provider)) ?? {
    provider,
    activeKeyId: null,
    fallbackEnabled: true,
  };
  await db().providerConfig.put({ ...cfg, activeKeyId: keyId });
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
}

export async function setActiveProvider(provider: LlmProviderId | null): Promise<void> {
  await db().llmGlobal.put({ id: 'singleton', activeProvider: provider });
}

export async function getAllApiKeys(): Promise<ApiKeyRow[]> {
  return db().apiKeys.orderBy('createdAt').toArray();
}

export async function getApiKey(id: string): Promise<ApiKeyRow | undefined> {
  return db().apiKeys.get(id);
}

export async function getProviderConfig(
  provider: LlmProviderId,
): Promise<ProviderConfigRow | undefined> {
  return db().providerConfig.get(provider);
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
  await db().apiKeys.update(id, {
    lastTestedAt: Date.now(),
    lastTestStatus: status,
    lastTestMessage: message,
  });
}
