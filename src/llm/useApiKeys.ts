import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addApiKey,
  deleteApiKey,
  getAllApiKeys,
  getLlmGlobal,
  getProviderConfig,
  recordKeyTest,
  setActiveKey,
  setActiveProvider,
  setFallbackEnabled,
  updateApiKey,
  type NewApiKey,
} from '../db/apiKeys';
import type { ApiKeyRow, LlmProviderId, ProviderConfigRow } from '../db/db';
import { getProvider, PROVIDERS } from './providers';
import type { TestResult } from './types';

/** Build an empty `Record<LlmProviderId, T>` populated for every registered provider. */
function emptyProviderRecord<T>(fill: () => T): Record<LlmProviderId, T> {
  const acc = {} as Record<LlmProviderId, T>;
  for (const p of PROVIDERS) acc[p.id] = fill();
  return acc;
}

export interface UseApiKeysReturn {
  loading: boolean;
  /** All saved keys across all providers. */
  keys: ApiKeyRow[];
  /** Per-provider config (active key id, fallback toggle). */
  configByProvider: Record<LlmProviderId, ProviderConfigRow | undefined>;
  /** Globally active provider — what Elle will use. */
  activeProvider: LlmProviderId | null;
  /** Currently active key for a given provider, if any. */
  activeKey: (provider: LlmProviderId) => ApiKeyRow | undefined;
  /** Keys saved for a given provider, ordered by createdAt. */
  keysFor: (provider: LlmProviderId) => ApiKeyRow[];

  // Mutations — async; they refresh state on completion.
  addKey: (input: NewApiKey) => Promise<void>;
  updateKey: (id: string, patch: Partial<Pick<ApiKeyRow, 'label' | 'apiKey' | 'model'>>) => Promise<void>;
  deleteKey: (id: string) => Promise<void>;
  makeActive: (provider: LlmProviderId, keyId: string | null) => Promise<void>;
  setFallback: (provider: LlmProviderId, enabled: boolean) => Promise<void>;
  setActiveProvider: (provider: LlmProviderId | null) => Promise<void>;

  /** Run testConnection() for a specific saved key. Records the outcome. */
  testKey: (id: string) => Promise<TestResult>;
}

/**
 * React hook over the Dexie-backed LLM key store. Reads happen on mount and
 * whenever a mutation completes; the hook always exposes the live state.
 */
export function useApiKeys(): UseApiKeysReturn {
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [configByProvider, setConfigByProvider] = useState<
    Record<LlmProviderId, ProviderConfigRow | undefined>
  >(() => emptyProviderRecord<ProviderConfigRow | undefined>(() => undefined));
  const [activeProvider, setActiveProviderState] = useState<LlmProviderId | null>(null);

  const refresh = useCallback(async () => {
    const [allKeys, cfgs, global] = await Promise.all([
      getAllApiKeys(),
      Promise.all(PROVIDERS.map((p) => getProviderConfig(p.id))),
      getLlmGlobal(),
    ]);
    const cfgByProvider = emptyProviderRecord<ProviderConfigRow | undefined>(() => undefined);
    PROVIDERS.forEach((p, i) => {
      cfgByProvider[p.id] = cfgs[i];
    });
    setKeys(allKeys);
    setConfigByProvider(cfgByProvider);
    setActiveProviderState(global?.activeProvider ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addKey = useCallback(
    async (input: NewApiKey) => {
      await addApiKey(input);
      // If no provider is active globally, make this one active so Elle has
      // something to use right after the user finishes adding their first key.
      const global = await getLlmGlobal();
      if (!global?.activeProvider) {
        await setActiveProvider(input.provider);
      }
      await refresh();
    },
    [refresh],
  );

  const updateKey = useCallback<UseApiKeysReturn['updateKey']>(
    async (id, patch) => {
      await updateApiKey(id, patch);
      await refresh();
    },
    [refresh],
  );

  const deleteKey = useCallback<UseApiKeysReturn['deleteKey']>(
    async (id) => {
      await deleteApiKey(id);
      await refresh();
    },
    [refresh],
  );

  const makeActive = useCallback<UseApiKeysReturn['makeActive']>(
    async (provider, keyId) => {
      await setActiveKey(provider, keyId);
      await refresh();
    },
    [refresh],
  );

  const setFallback = useCallback<UseApiKeysReturn['setFallback']>(
    async (provider, enabled) => {
      await setFallbackEnabled(provider, enabled);
      await refresh();
    },
    [refresh],
  );

  const setActiveProviderCb = useCallback<UseApiKeysReturn['setActiveProvider']>(
    async (provider) => {
      await setActiveProvider(provider);
      await refresh();
    },
    [refresh],
  );

  const testKey = useCallback<UseApiKeysReturn['testKey']>(
    async (id) => {
      const row = keys.find((k) => k.id === id);
      if (!row) return { ok: false, message: 'Key not found.' };
      const provider = getProvider(row.provider);
      const result = await provider.testConnection(row.apiKey, row.model);
      await recordKeyTest(id, result.ok ? 'ok' : 'error', result.message);
      await refresh();
      return result;
    },
    [keys, refresh],
  );

  const keysByProvider = useMemo(() => {
    const acc = emptyProviderRecord<ApiKeyRow[]>(() => []);
    for (const k of keys) acc[k.provider].push(k);
    return acc;
  }, [keys]);

  const activeKey = useCallback(
    (provider: LlmProviderId) => {
      const cfg = configByProvider[provider];
      if (!cfg?.activeKeyId) return undefined;
      return keys.find((k) => k.id === cfg.activeKeyId);
    },
    [configByProvider, keys],
  );

  const keysFor = useCallback(
    (provider: LlmProviderId) => keysByProvider[provider],
    [keysByProvider],
  );

  return {
    loading,
    keys,
    configByProvider,
    activeProvider,
    activeKey,
    keysFor,
    addKey,
    updateKey,
    deleteKey,
    makeActive,
    setFallback,
    setActiveProvider: setActiveProviderCb,
    testKey,
  };
}
