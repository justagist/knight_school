import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import {
  useSettings,
  type BoardTheme,
  type EngineVariant,
  ANALYSIS_DEPTH_MIN,
  ANALYSIS_DEPTH_MAX,
} from '../settings/SettingsProvider';
import { LlmSection } from './settings/LlmSection';
import { LichessSection } from './settings/LichessSection';
import { StorageSection } from './settings/StorageSection';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const BOARD_THEMES: { value: BoardTheme; label: string }[] = [
  { value: 'brown', label: 'Brown' },
  { value: 'green', label: 'Green' },
];

const ENGINE_VARIANTS: { value: EngineVariant; label: string; hint: string }[] = [
  { value: 'lite', label: 'Lite', hint: '~400 KB · classical Stockfish · ships with the app' },
  // TODO(full-mode): When NNUE download flow lands, swap the disabled state +
  // tooltip below to a real on-click handler that triggers nnueStore.ensureLoaded()
  // and shows a progress bar (bytes received / total). See EngineVariant in
  // src/settings/SettingsProvider.tsx for the broader integration plan.
  { value: 'full', label: 'Full', hint: '~40 MB · NNUE Stockfish · downloads on demand · coming soon' },
];

export function SettingsPage() {
  const { mode, setMode } = useTheme();
  const { settings, update } = useSettings();
  const buildDate = __BUILD_DATE__ ? new Date(__BUILD_DATE__).toLocaleString() : 'dev';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Appearance, engine, sounds, LLM provider, and storage.
        </p>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Appearance
        </h2>

        <div className="space-y-3">
          <SegmentedGroup
            label="Theme"
            options={MODES}
            value={mode}
            onChange={(v) => setMode(v as ThemeMode)}
          />
          <SegmentedGroup
            label="Board theme"
            options={BOARD_THEMES}
            value={settings.boardTheme}
            onChange={(v) => update('boardTheme', v as BoardTheme)}
          />

          <Toggle
            label="Show coordinates"
            checked={settings.showCoordinates}
            onChange={(v) => update('showCoordinates', v)}
          />
          <Toggle
            label="Highlight last move"
            checked={settings.highlightLastMove}
            onChange={(v) => update('highlightLastMove', v)}
          />
          <Toggle
            label="Show legal-move dots"
            checked={settings.showLegalMoves}
            onChange={(v) => update('showLegalMoves', v)}
          />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Engine
        </h2>

        <div className="space-y-4">
          <Toggle
            label="Enable engine analysis"
            checked={settings.engineEnabled}
            onChange={(v) => update('engineEnabled', v)}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Engine variant</span>
              <span className="text-[11px] text-ink-500 dark:text-ink-400">
                Multi-PV is fixed at 3 lines.
              </span>
            </div>
            <div className="space-y-2">
              {ENGINE_VARIANTS.map((v) => {
                const disabled = v.value === 'full';
                const active = settings.engineVariant === v.value;
                return (
                  <button
                    key={v.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => update('engineVariant', v.value)}
                    title={
                      disabled
                        ? 'Full mode arrives in a later update — it needs a one-time ~40 MB NNUE download flow.'
                        : undefined
                    }
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-accent bg-accent/10'
                        : 'border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600'
                    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>{v.label}</span>
                      {disabled && (
                        <span className="rounded bg-ink-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                          coming soon
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{v.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Analysis depth</span>
              <span className="font-mono text-xs tabular-nums text-ink-700 dark:text-ink-300">
                {settings.analysisDepth}
              </span>
            </div>
            <input
              type="range"
              min={ANALYSIS_DEPTH_MIN}
              max={ANALYSIS_DEPTH_MAX}
              step={1}
              value={settings.analysisDepth}
              onChange={(e) => update('analysisDepth', Number.parseInt(e.target.value, 10))}
              className="mt-1 w-full accent-accent"
              aria-label="Analysis depth"
            />
            <div className="mt-1 flex justify-between text-[10px] text-ink-500 dark:text-ink-400">
              <span>{ANALYSIS_DEPTH_MIN}</span>
              <span>higher = stronger but slower</span>
              <span>{ANALYSIS_DEPTH_MAX}</span>
            </div>
            <p className="mt-2 text-[11px] text-ink-500 dark:text-ink-400">
              Move classification (inaccuracy / mistake / blunder) requires depth ≥ 16. Below that,
              evaluations are still shown but moves stay unclassified.
            </p>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Sounds
        </h2>
        <div className="space-y-2">
          <Toggle
            label="Enable move sounds"
            checked={settings.soundsEnabled}
            onChange={(v) => update('soundsEnabled', v)}
          />
          <p className="text-xs text-ink-500 dark:text-ink-400">
            Off by default. Plays a short tone when you step forward through a move (mute, capture,
            check, and game-end variants).
          </p>
        </div>
      </section>

      <LlmSection />

      <LichessSection />

      <StorageSection />

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Keyboard shortcuts
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-mono text-xs text-ink-500 dark:text-ink-400">←</dt>
          <dd>Previous move</dd>
          <dt className="font-mono text-xs text-ink-500 dark:text-ink-400">→</dt>
          <dd>Next move</dd>
          <dt className="font-mono text-xs text-ink-500 dark:text-ink-400">Home</dt>
          <dd>Jump to start</dd>
          <dt className="font-mono text-xs text-ink-500 dark:text-ink-400">End</dt>
          <dd>Jump to final move</dd>
          <dt className="font-mono text-xs text-ink-500 dark:text-ink-400">f</dt>
          <dd>Flip board</dd>
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          About
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-500 dark:text-ink-400">Version</dt>
          <dd>{__APP_VERSION__}</dd>
          <dt className="text-ink-500 dark:text-ink-400">Build</dt>
          <dd>{buildDate}</dd>
          <dt className="text-ink-500 dark:text-ink-400">License</dt>
          <dd>MIT</dd>
        </dl>
        <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
          Elle is an AI. Outputs may be wrong — verify important claims with the engine or other
          sources.
        </p>
      </section>
    </div>
  );
}

interface SegmentedGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedGroup<T extends string>({ label, options, value, onChange }: SegmentedGroupProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[7rem] text-sm">{label}</span>
      <div className="inline-flex rounded-md border border-ink-200 p-0.5 dark:border-ink-700">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              value === opt.value
                ? 'bg-accent text-white'
                : 'text-ink-700 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-ink-300 dark:bg-ink-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
