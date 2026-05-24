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
import { SettingsAccordion } from './settings/SettingsAccordion';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const BOARD_THEMES: { value: BoardTheme; label: string }[] = [
  // `auto` pairs with the app theme — brown squares in light mode, slate
  // in dark mode. Naming it after the BEHAVIOUR rather than a colour avoids
  // the "but it's not brown in dark mode" confusion the old `brown` label
  // created.
  { value: 'auto', label: 'Theme-paired' },
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

/**
 * Settings page — long, so every section is an accordion. Appearance opens
 * by default (cheapest tweaks live there); everything else is collapsed.
 * Chip nav at the top lets users jump straight to a section.
 */
export function SettingsPage() {
  const { mode, setMode } = useTheme();
  const { settings, update } = useSettings();
  const buildDate = __BUILD_DATE__ ? new Date(__BUILD_DATE__).toLocaleString() : 'dev';

  return (
    // Constrain settings to ~960px on desktop so the section cards don't
    // sprawl across a 1900px viewport. Mobile width stays full.
    <div className="mx-auto max-w-[960px] space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">
          Appearance, engine, sounds, LLM provider, and storage.
        </p>
      </div>

      <SettingsAccordion id="appearance" title="Appearance" defaultOpen>
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
          {settings.showCoordinates && (
            <Toggle
              label="Coordinates on every square"
              checked={settings.coordinatesOnSquares}
              onChange={(v) => update('coordinatesOnSquares', v)}
            />
          )}
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
      </SettingsAccordion>

      <SettingsAccordion id="engine" title="Engine">
        <div className="space-y-4">
          <Toggle
            label="Enable engine analysis"
            checked={settings.engineEnabled}
            onChange={(v) => update('engineEnabled', v)}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Engine variant</span>
              <span className="text-[11px] text-muted">Multi-PV is fixed at 3 lines.</span>
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
                        ? 'border-accent bg-accent-soft'
                        : 'border-border hover:border-accent/60'
                    } ${disabled ? 'cursor-not-allowed opacity-50 grayscale' : ''}`}
                  >
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>{v.label}</span>
                      {disabled && (
                        // Filled badge per spec — reads clearly as
                        // "unavailable yet" instead of the old outlined pill
                        // that blended into the card background.
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-surface-1">
                          coming soon
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{v.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span>Analysis depth</span>
              <span className="font-mono text-xs tabular-nums text-primary">
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
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>{ANALYSIS_DEPTH_MIN}</span>
              <span>higher = stronger but slower</span>
              <span>{ANALYSIS_DEPTH_MAX}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Move classification (inaccuracy / mistake / blunder) requires depth ≥ 16. Below that,
              evaluations are still shown but moves stay unclassified.
            </p>
          </div>
        </div>
      </SettingsAccordion>

      <SettingsAccordion id="sounds" title="Sounds">
        <div className="space-y-2">
          <Toggle
            label="Enable move sounds"
            checked={settings.soundsEnabled}
            onChange={(v) => update('soundsEnabled', v)}
          />
          <p className="text-xs text-muted">
            Off by default. Plays a short tone when you step forward through a move (mute, capture,
            check, and game-end variants).
          </p>
        </div>
      </SettingsAccordion>

      <SettingsAccordion id="elle" title="Elle (LLM)">
        <LlmSection />
      </SettingsAccordion>

      <SettingsAccordion id="lichess" title="Lichess account">
        <LichessSection />
      </SettingsAccordion>

      <SettingsAccordion id="storage" title="Storage">
        <StorageSection />
      </SettingsAccordion>

      <SettingsAccordion id="shortcuts" title="Keyboard shortcuts">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-mono text-xs text-muted">←</dt>
          <dd>Previous move</dd>
          <dt className="font-mono text-xs text-muted">→</dt>
          <dd>Next move</dd>
          <dt className="font-mono text-xs text-muted">Home</dt>
          <dd>Jump to start</dd>
          <dt className="font-mono text-xs text-muted">End</dt>
          <dd>Jump to final move</dd>
          <dt className="font-mono text-xs text-muted">f</dt>
          <dd>Flip board</dd>
        </dl>
      </SettingsAccordion>

      <SettingsAccordion id="about" title="About">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Version</dt>
          <dd>{__APP_VERSION__}</dd>
          <dt className="text-muted">Build</dt>
          <dd>{buildDate}</dd>
          <dt className="text-muted">License</dt>
          <dd>MIT</dd>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Elle is an AI. Outputs may be wrong — verify important claims with the engine or other
          sources.
        </p>
      </SettingsAccordion>
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
      <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              value === opt.value
                ? 'bg-accent text-white'
                : 'text-muted hover:text-primary'
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
  // Container is 44px tall so the whole row meets the iOS/Android tap-target
  // guideline; the visible pill stays compact inside it.
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-2 border border-border'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
