import { useMemo, useState } from 'react';
import { PROVIDERS, getProvider, getProviderInfo } from '../../llm/providers';
import { useApiKeys } from '../../llm/useApiKeys';
import type { ApiKeyRow, LlmProviderId } from '../../db/db';
import type { TestResult } from '../../llm/types';

export function LlmSection() {
  const keys = useApiKeys();
  const [selectedProvider, setSelectedProvider] = useState<LlmProviderId>(
    () => keys.activeProvider ?? PROVIDERS[0].id,
  );

  if (keys.loading) {
    return <div className="text-sm text-muted">Loading keys…</div>;
  }

  const providerKeys = keys.keysFor(selectedProvider);
  const providerCfg = keys.configByProvider[selectedProvider];
  const provider = getProvider(selectedProvider);
  const info = getProviderInfo(selectedProvider);
  const anythingSaved = keys.keys.length > 0;

  const pickProvider = (p: LlmProviderId) => {
    // Per spec: clicking a provider pill BOTH sets it active AND shows
    // its keys below. Merging the two previously-duplicated rows. Setting
    // active is only safe when the provider has at least one saved key —
    // otherwise the app would be configured with an unusable provider.
    setSelectedProvider(p);
    const hasKey = keys.keys.some((k) => k.provider === p);
    if (hasKey) {
      void keys.setActiveProvider(p);
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Provider
        </span>
        <span className="text-[11px] text-faint">
          Tap to switch the active provider and manage its keys.
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {PROVIDERS.map((p) => {
          const isSelected = selectedProvider === p.id;
          const isActive = keys.activeProvider === p.id;
          const hasKey = keys.keys.some((k) => k.provider === p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pickProvider(p.id)}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                isSelected
                  ? 'border-accent bg-accent-soft text-primary'
                  : 'border-border text-muted hover:text-primary'
              }`}
              title={
                isActive
                  ? `${p.displayName} (active provider)`
                  : hasKey
                    ? `Set ${p.displayName} as the active provider and show its keys`
                    : `Add a ${p.displayName} key below to enable`
              }
            >
              {isActive && (
                <span className="text-accent" aria-label="active">
                  ✓
                </span>
              )}
              {p.displayName}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          {info.blurb}{' '}
          <a
            className="underline-offset-2 hover:underline"
            href={info.apiKeyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Get a key →
          </a>
        </p>

        {providerKeys.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-300 px-3 py-4 text-center text-xs text-ink-500 dark:border-ink-700 dark:text-ink-400">
            No {provider.displayName} keys saved yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {providerKeys.map((row) => (
              <KeyRow
                key={row.id}
                row={row}
                isActive={providerCfg?.activeKeyId === row.id}
                provider={provider}
                onMakeActive={() => keys.makeActive(selectedProvider, row.id)}
                onUpdate={(patch) => keys.updateKey(row.id, patch)}
                onDelete={() => keys.deleteKey(row.id)}
                onTest={() => keys.testKey(row.id)}
              />
            ))}
          </ul>
        )}

        <AddKeyForm
          provider={provider}
          onAdd={(label, apiKey, model) =>
            keys.addKey({ provider: selectedProvider, label, apiKey, model })
          }
        />

        {providerKeys.length > 1 && (
          <label className="mt-3 flex items-center gap-2 text-xs text-ink-600 dark:text-ink-400">
            <input
              type="checkbox"
              checked={providerCfg?.fallbackEnabled ?? true}
              onChange={(e) => keys.setFallback(selectedProvider, e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span>
              <span className="font-medium text-ink-700 dark:text-ink-200">Auto-fallback.</span> If
              the active key rate-limits during chat (Step 6+), try the next saved key for this
              provider.
            </span>
          </label>
        )}

        <details className="mt-3 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
          <summary className="cursor-pointer select-none">News access via web search</summary>
          <p className="mt-1">{info.webSearchNote}</p>
        </details>
      </div>

      {!anythingSaved && (
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted">
          Tip: start with Groq for the most generous free tier (no credit card, ~1,000 requests/day on Llama 3.3 70B). Gemini is the easiest free path if you want web search. Add a paid Anthropic or OpenAI key for stronger reasoning — auto-fallback handles the switching between keys when one hits a limit.
        </p>
      )}
    </>
  );
}

// ActiveProviderRow was merged into the inline provider pill row above —
// clicking a pill now sets active AND shows that provider's keys, so a
// separate "Active provider" selector is redundant.

interface KeyRowProps {
  row: ApiKeyRow;
  isActive: boolean;
  provider: ReturnType<typeof getProvider>;
  onMakeActive: () => Promise<void>;
  onUpdate: (patch: Partial<Pick<ApiKeyRow, 'label' | 'apiKey' | 'model'>>) => Promise<void>;
  onDelete: () => Promise<void>;
  onTest: () => Promise<TestResult>;
}

function KeyRow({ row, isActive, provider, onMakeActive, onUpdate, onDelete, onTest }: KeyRowProps) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);

  const masked = useMemo(() => maskKey(row.apiKey), [row.apiKey]);
  const testStatusText = formatTestStatus(row);

  if (editing) {
    return (
      <li>
        <EditKeyForm
          row={row}
          provider={provider}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            await onUpdate(patch);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`rounded-md border px-3 py-2 ${
        isActive
          ? 'border-accent/60 bg-accent/5'
          : 'border-ink-200 dark:border-ink-800'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium">{row.label}</span>
        <span className="text-[11px] text-ink-500 dark:text-ink-400">
          {modelLabel(provider, row.model)}
        </span>
        {isActive && (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            Active
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-600 dark:text-ink-400">
        <span>{revealed ? row.apiKey : masked}</span>
        <button
          type="button"
          className="btn-ghost px-1.5 py-0 text-[10px]"
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      <div className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">{testStatusText}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {!isActive && (
          <button type="button" className="btn-secondary text-xs" onClick={() => void onMakeActive()}>
            Make active
          </button>
        )}
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            try {
              await onTest();
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          type="button"
          className="btn-ghost text-xs text-red-600 dark:text-red-400"
          onClick={() => {
            if (window.confirm(`Delete the "${row.label}" key? This can't be undone.`)) {
              void onDelete();
            }
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

interface AddKeyFormProps {
  provider: ReturnType<typeof getProvider>;
  onAdd: (label: string, apiKey: string, model: string) => Promise<void>;
}

function AddKeyForm({ provider, onAdd }: AddKeyFormProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(provider.defaultModel());
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn-secondary mt-3 text-xs"
        onClick={() => {
          setOpen(true);
          setModel(provider.defaultModel());
        }}
      >
        + Add {provider.displayName} key
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-2 rounded-md border border-ink-200 p-3 dark:border-ink-800"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!apiKey.trim()) return;
        setSubmitting(true);
        try {
          await onAdd(label || 'Untitled', apiKey, model);
          setOpen(false);
          setLabel('');
          setApiKey('');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">Label</label>
        <input
          className="input mt-1 text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Personal"
        />
      </div>
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">API key</label>
        <input
          className="input mt-1 font-mono text-xs"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={maskedExample(provider.id)}
        />
      </div>
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">Model</label>
        <select
          className="input mt-1 text-sm"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {provider.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.hint ? ` — ${m.hint}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary text-xs" disabled={submitting || !apiKey.trim()}>
          {submitting ? 'Saving…' : 'Save key'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface EditKeyFormProps {
  row: ApiKeyRow;
  provider: ReturnType<typeof getProvider>;
  onSave: (patch: Partial<Pick<ApiKeyRow, 'label' | 'apiKey' | 'model'>>) => Promise<void>;
  onCancel: () => void;
}

function EditKeyForm({ row, provider, onSave, onCancel }: EditKeyFormProps) {
  const [label, setLabel] = useState(row.label);
  const [apiKey, setApiKey] = useState(row.apiKey);
  const [model, setModel] = useState(row.model);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="space-y-2 rounded-md border border-accent/40 bg-accent/5 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
          await onSave({ label, apiKey, model });
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">Label</label>
        <input className="input mt-1 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">API key</label>
        <input
          className="input mt-1 font-mono text-xs"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">Model</label>
        <select className="input mt-1 text-sm" value={model} onChange={(e) => setModel(e.target.value)}>
          {provider.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.hint ? ` — ${m.hint}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary text-xs" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`.padStart(12, '•');
}

function maskedExample(provider: LlmProviderId): string {
  switch (provider) {
    case 'anthropic':
      return 'sk-ant-…';
    case 'openai':
      return 'sk-…';
    case 'gemini':
      return 'AIza…';
    case 'groq':
      return 'gsk_…';
    case 'openrouter':
      return 'sk-or-…';
  }
}

function modelLabel(provider: ReturnType<typeof getProvider>, modelId: string): string {
  return provider.models.find((m) => m.id === modelId)?.label ?? modelId;
}

function formatTestStatus(row: ApiKeyRow): string {
  if (!row.lastTestedAt) return 'Not tested yet.';
  const when = relativeTime(row.lastTestedAt);
  if (row.lastTestStatus === 'ok') return `Tested ${when}: ✓ ${row.lastTestMessage ?? 'OK'}`;
  return `Tested ${when}: ✗ ${row.lastTestMessage ?? 'failed'}`;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}
