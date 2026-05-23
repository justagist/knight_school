import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Board colour scheme.
 *
 * - `auto` (default) — pairs with the app theme. Brown in light mode,
 *   slate in dark mode. Driven by the `--board-light` / `--board-dark`
 *   tokens declared in src/styles/index.css.
 * - `green` — fixed green palette, theme-agnostic.
 *
 * The legacy `brown` value is silently migrated to `auto` on load —
 * `auto` already shows a brown board in light mode, which is what users
 * who picked "brown" historically wanted, and they now also get a
 * sensible slate board in dark mode for free.
 */
export type BoardTheme = 'auto' | 'green';

/**
 * Engine variants:
 * - 'lite': stockfish.wasm (SF_classical, ~400 KB, ships with the app).
 *   Wired up and the only functional variant today.
 * - 'full': NNUE-based Stockfish (~40 MB, downloads on first use).
 *
 * TODO(full-mode): When implementing 'full', the actual switch happens in
 * three places:
 *   1) src/engine/engine.ts → createEngine(): pick a different worker URL
 *      (e.g. /engine/ks-engine-full.js) based on settings.engineVariant.
 *   2) public/engine/ks-engine-full.js (NEW): mirrors ks-engine.js but
 *      loads `lila-stockfish-web` (sf16-7 or sf171-79) and calls
 *      setNnueBuffer() with NNUE blobs fetched from Lichess CDN.
 *   3) src/engine/nnueStore.ts (NEW): IndexedDB-backed cache for NNUE
 *      files keyed by filename + hash. First load fetches with progress
 *      events (XHR/streams) → stores blob → resolves. Subsequent loads
 *      read from IDB. Surface progress via a new postMessage type so the
 *      Settings UI can render the download bar described in the spec.
 * Until then SettingsPage renders 'full' as a disabled "coming soon" card.
 */
export type EngineVariant = 'lite' | 'full';

export interface AppSettings {
  // Appearance
  boardTheme: BoardTheme;
  showCoordinates: boolean;
  /**
   * When true, render a coord label inside every square (chess.com style).
   * When false (default), render only the outside rank/file labels in the
   * lichess / classic chess UI style — letters under the bottom row, numbers
   * to the left of the leftmost column.
   */
  coordinatesOnSquares: boolean;
  highlightLastMove: boolean;
  showLegalMoves: boolean;
  // Engine
  engineVariant: EngineVariant;
  analysisDepth: number;
  engineEnabled: boolean;
  // Sounds
  soundsEnabled: boolean;
}

export const ANALYSIS_DEPTH_MIN = 10;
export const ANALYSIS_DEPTH_MAX = 30;
export const ANALYSIS_DEPTH_DEFAULT = 18;

const DEFAULT_SETTINGS: AppSettings = {
  boardTheme: 'auto',
  showCoordinates: true,
  coordinatesOnSquares: false,
  highlightLastMove: true,
  showLegalMoves: true,
  engineVariant: 'lite',
  analysisDepth: ANALYSIS_DEPTH_DEFAULT,
  engineEnabled: true,
  // Spec: sounds are OFF by default.
  soundsEnabled: false,
};

const STORAGE_KEY = 'ks-settings-v1';

interface SettingsContextValue {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readStored(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      boardTheme?: string;
    };
    // Migrate legacy `boardTheme: 'brown'` → `'auto'`. The old "brown" value
    // didn't survive the dark-mode reactivity refactor; auto preserves what
    // the user actually saw (brown in light) without forcing brown into dark.
    const migratedBoardTheme: BoardTheme =
      parsed.boardTheme === 'green' ? 'green' : 'auto';
    return { ...DEFAULT_SETTINGS, ...parsed, boardTheme: migratedBoardTheme };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readStored());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const update = useCallback<SettingsContextValue['update']>((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
