import { useEffect, useState } from 'react';
import type { StudyRow } from '../db/db';

export type DrillScope = 'chapter' | 'mixed' | 'pick';
export type DrillMode = 'free' | 'spot';
export type DrillSide = 'white' | 'black';
export type DrillLength = 10 | 25 | 50 | 0; // 0 = all

export interface DrillSetupResult {
  scope: DrillScope;
  mode: DrillMode;
  side: DrillSide;
  length: DrillLength;
  /** Subset of chapter indices when scope = 'pick' or 'chapter'. For
   *  'mixed' the engine reads every chapter regardless. */
  chapterIndices: number[];
}

interface DrillSetupModalProps {
  study: StudyRow;
  /**
   * Initial defaults — caller picks based on entry point:
   *   - study-level "Drill" button → mixed / free / 25
   *   - per-chapter "Drill" button → chapter / free / all (preserves the
   *     pre-modal behaviour)
   */
  initial: DrillSetupResult;
  open: boolean;
  onClose: () => void;
  onStart: (result: DrillSetupResult) => void;
}

/**
 * Setup modal for the drill engine. Replaces the inline side-picker that
 * used to live above the chapter body. Lets the user pick scope (this
 * chapter / mixed / pick), mode (free / spot), training side, and a
 * length cap. Single "Start drill" CTA at the bottom.
 *
 * Spot mode requires at least one position in the chosen scope where
 * exactly one user-move exists — the engine itself will surface that
 * constraint with a friendly empty state if the user picks spot on a
 * scope that produces none.
 */
export function DrillSetupModal({
  study,
  initial,
  open,
  onClose,
  onStart,
}: DrillSetupModalProps) {
  const [scope, setScope] = useState<DrillScope>(initial.scope);
  const [mode, setMode] = useState<DrillMode>(initial.mode);
  const [side, setSide] = useState<DrillSide>(initial.side);
  const [length, setLength] = useState<DrillLength>(initial.length);
  const [chapterIndices, setChapterIndices] = useState<number[]>(initial.chapterIndices);

  // Reset state when the modal opens with new defaults — happens when the
  // user opens the modal from a different chapter than the previous one.
  useEffect(() => {
    if (!open) return;
    setScope(initial.scope);
    setMode(initial.mode);
    setSide(initial.side);
    setLength(initial.length);
    setChapterIndices(initial.chapterIndices);
  }, [open, initial.scope, initial.mode, initial.side, initial.length, initial.chapterIndices]);

  if (!open) return null;

  const allChapters = study.chapters.map((_, i) => i);
  const effectiveChapters =
    scope === 'mixed' ? allChapters : scope === 'pick' ? chapterIndices : chapterIndices;
  const canStart = effectiveChapters.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-label="Set up drill"
      onClick={onClose}
    >
      <div
        className="card flex w-full max-w-md flex-col gap-4 p-4 text-primary sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-primary">Set up drill</h2>
            <p className="text-[11px] text-muted">
              {study.name} · {study.chapters.length} chapter
              {study.chapters.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {/* Scope */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Scope
          </legend>
          <Radio
            name="scope"
            value="chapter"
            checked={scope === 'chapter'}
            onChange={() => setScope('chapter')}
            label="This chapter only"
            hint={
              chapterIndices.length === 1
                ? `${study.chapters[chapterIndices[0]]?.title ?? `Chapter ${chapterIndices[0] + 1}`}`
                : 'Original per-chapter drill.'
            }
          />
          <Radio
            name="scope"
            value="mixed"
            checked={scope === 'mixed'}
            onChange={() => {
              setScope('mixed');
              setChapterIndices(allChapters);
            }}
            label="All chapters (mixed)"
            hint={`Positions sampled across all ${study.chapters.length} chapters.`}
          />
          <Radio
            name="scope"
            value="pick"
            checked={scope === 'pick'}
            onChange={() => {
              setScope('pick');
              if (chapterIndices.length === 0) setChapterIndices([0]);
            }}
            label="Pick chapters"
            hint="Choose a subset."
          />
          {scope === 'pick' && (
            <ul className="ml-6 mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto border-l border-border pl-3">
              {study.chapters.map((c, i) => {
                const checked = chapterIndices.includes(i);
                return (
                  <li key={i}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChapterIndices((xs) => [...xs, i].sort((a, b) => a - b));
                          } else {
                            setChapterIndices((xs) => xs.filter((x) => x !== i));
                          }
                        }}
                        className="h-3.5 w-3.5 accent-accent"
                      />
                      <span className="text-primary">{i + 1}. {c.title}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        {/* Mode */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Mode
          </legend>
          <Radio
            name="mode"
            value="free"
            checked={mode === 'free'}
            onChange={() => setMode('free')}
            label="Free drill"
            hint="Walk through full lines move by move. Wrong move ends the drill."
          />
          <Radio
            name="mode"
            value="spot"
            checked={mode === 'spot'}
            onChange={() => setMode('spot')}
            label="Spot drill"
            hint="App sets up critical positions; you find the single correct move."
          />
        </fieldset>

        {/* Side */}
        <fieldset className="flex items-center gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
            Side
          </legend>
          <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5 text-xs">
            <SideBtn label="White" active={side === 'white'} onClick={() => setSide('white')} />
            <SideBtn label="Black" active={side === 'black'} onClick={() => setSide('black')} />
          </div>
        </fieldset>

        {/* Length */}
        <fieldset className="flex items-center gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
            Length
          </legend>
          <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5 text-xs">
            {[10, 25, 50, 0].map((n) => (
              <SideBtn
                key={n}
                label={n === 0 ? 'All' : String(n)}
                active={length === n}
                onClick={() => setLength(n as DrillLength)}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-1 flex items-center justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onStart({
                scope,
                mode,
                side,
                length,
                chapterIndices:
                  scope === 'mixed' ? allChapters : chapterIndices,
              })
            }
            disabled={!canStart}
            className="btn-primary text-sm"
          >
            Start drill
          </button>
        </div>
      </div>
    </div>
  );
}

function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-3.5 w-3.5 accent-accent"
      />
      <span className="flex flex-col">
        <span className="text-sm text-primary">{label}</span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function SideBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1 transition-colors ${
        active ? 'bg-accent text-white' : 'text-muted hover:text-primary'
      }`}
    >
      {label}
    </button>
  );
}
