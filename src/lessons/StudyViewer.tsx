import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudyRow } from '../db/db';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { EvalBar } from '../components/EvalBar';
import { parsePgn, type ParsedGame } from '../lib/pgn';
import { importStudy } from './lichessStudy';
import { notifyStudiesChanged } from './useStudies';
import { useEngine } from '../engine/useEngine';
import { useSettings } from '../settings/SettingsProvider';
import { useChatScreen } from '../chat/ChatContextProvider';
import { useChatHost } from '../chat/ChatHost';
import { summarizeEngine } from '../llm/engineSummary';
import { DrillSetupModal, type DrillSetupResult } from '../drill/DrillSetupModal';
import { recordLessonProgress } from '../db/lessonProgress';

interface StudyViewerProps {
  study: StudyRow;
  /** Initial chapter index to show. Clamped to chapter count. */
  initialChapter?: number;
  /** Initial ply to land on inside the initial chapter (used by the
   *  lesson resume queue's deep-link). Clamped to the chapter's ply
   *  count; ignored when the chapter doesn't parse. */
  initialPly?: number;
  /** Notify the page when the chapter changes so it can update the URL. */
  onChapterChange?: (index: number) => void;
  /** "Back to library" button handler. */
  onBack: () => void;
  /** Called after a successful refresh (re-imports + overwrites). */
  onRefreshed?: () => void;
  /**
   * Start drilling the current chapter as the given side. The page wires
   * this to ensure-line + navigate to `?drill=<id>` so the parent
   * OpeningsPage can render DrillView. Used for `scope: chapter` results
   * from the setup modal.
   */
  onStartDrill?: (chapterIndex: number, side: 'white' | 'black') => void;
  /**
   * Start a mixed / spot drill across multiple chapters. Parent routes to
   * the mixed-drill view via the encoded session params.
   */
  onStartMixedDrill?: (config: DrillSetupResult) => void;
  /**
   * Add a drill config to the Practice queue without launching it.
   * Wired the same way as `onStartMixedDrill` but writes a DrillSession
   * row instead of navigating.
   */
  onQueueDrill?: (config: DrillSetupResult) => void;
}

/**
 * Lichess-study viewer. Top row: back button + study title + chapter dropdown
 * + refresh. Body: orientation-aware board on the left, move list on the
 * right, chapter description below. Keyboard arrows step through plies.
 */
export function StudyViewer({
  study,
  initialChapter = 0,
  initialPly = 0,
  onChapterChange,
  onBack,
  onRefreshed,
  onStartDrill,
  onStartMixedDrill,
  onQueueDrill,
}: StudyViewerProps) {
  const chapterCount = study.chapters.length;
  const safeInitial = clampIndex(initialChapter, chapterCount);
  const [chapterIdx, setChapterIdx] = useState(safeInitial);
  const [ply, setPly] = useState(initialPly);
  const [parseError, setParseError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Drill setup state.
   *   - kind 'chapter': modal opens with chapter-scope defaults (the
   *     per-chapter "Drill this chapter" button).
   *   - kind 'study':   modal opens with mixed-scope defaults (the
   *     study-level "Drill" button in the header).
   *   - null:           modal hidden.
   */
  const [drillSetup, setDrillSetup] = useState<null | 'chapter' | 'study'>(null);
  const { settings } = useSettings();
  const chatScreen = useChatScreen();
  const chatHost = useChatHost();

  // Reset to the requested chapter + ply when the study itself changes
  // (or when the resume queue navigates to a specific ply). Reading
  // initialPly here makes the resume-queue deep-link land on the saved
  // position instead of ply 0.
  useEffect(() => {
    setChapterIdx(clampIndex(initialChapter, study.chapters.length));
    setPly(initialPly);
  }, [study.id, study.chapters.length, initialChapter, initialPly]);

  const chapter = study.chapters[chapterIdx];

  const parsed = useMemo<ParsedGame | null>(() => {
    if (!chapter) return null;
    try {
      setParseError(null);
      return parsePgn(chapter.pgn);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse chapter.');
      return null;
    }
  }, [chapter]);

  // Clamp ply if the chapter changed and the new chapter has fewer plies.
  useEffect(() => {
    if (!parsed) return;
    setPly((p) => Math.min(p, parsed.moves.length));
  }, [parsed]);

  const changeChapter = useCallback(
    (next: number) => {
      const clamped = clampIndex(next, chapterCount);
      setChapterIdx(clamped);
      setPly(0);
      onChapterChange?.(clamped);
    },
    [chapterCount, onChapterChange],
  );

  // Keyboard navigation: ← / → for ply, Home/End for chapter ends.
  useEffect(() => {
    if (!parsed) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore if a text input is focused (importer, future search, etc.)
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') {
        setPly((p) => Math.min(p + 1, parsed.moves.length));
      } else if (e.key === 'ArrowLeft') {
        setPly((p) => Math.max(0, p - 1));
      } else if (e.key === 'Home') {
        setPly(0);
      } else if (e.key === 'End') {
        setPly(parsed.moves.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [parsed]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await importStudy(study.id, { curatedKey: study.curatedKey });
      notifyStudiesChanged();
      onRefreshed?.();
    } catch (err) {
      // Surface in the parseError slot since we don't have a separate banner.
      setParseError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const orientation = inferOrientation(parsed, chapter?.title ?? '');

  // FEN at the current ply - drives the eval bar engine.
  const currentFen = parsed ? parsed.fens[ply] ?? parsed.startingFen : null;

  // Per-position live engine for the eval bar. Same setup as the Analyze
  // view (lite variant, user-configured depth). No interactivity in lesson
  // mode, but the user still wants the eval to follow them through the
  // chapter so they can see how the position swings as the author walks
  // through theory.
  const engine = useEngine({
    fen: currentFen,
    depth: settings.analysisDepth,
    enabled: settings.engineEnabled && settings.engineVariant === 'lite',
  });

  // Publish the lesson screen context to the chat host so Elle has full
  // visibility of the chapter - all moves, every author comment, the ply
  // the user is looking at, and the current engine eval. Lets the user ask
  // hypotheticals like "what if I played X instead of Y here?".
  useEffect(() => {
    if (!chapter) return;
    chatHost.setRawPgn(chapter.pgn);
    if (!parsed) {
      chatScreen.setScreen({ kind: 'idle' });
      return;
    }
    const currentMoveSan = ply > 0 ? parsed.moves[ply - 1]?.san : undefined;
    chatScreen.setScreen({
      kind: 'lesson',
      lesson: {
        studyName: study.name,
        studyId: study.id,
        chapterIndex: chapterIdx + 1,
        chapterCount,
        chapterTitle: chapter.title,
        chapterMoves: parsed.moves.map((m) => m.san),
        chapterComments: parsed.comments,
        currentPly: ply,
        currentFen: currentFen ?? parsed.startingFen,
        currentMoveSan,
        engineSummary: summarizeEngine(engine.snapshot),
      },
    });
    // chatHost.setRawPgn + chatScreen.setScreen identities are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, parsed, ply, chapterIdx, chapterCount, study.name, study.id, engine.snapshot, currentFen]);

  // Revert to idle on unmount so the General chat thread comes back when
  // the user leaves the lesson viewer.
  useEffect(() => {
    return () => {
      chatHost.setRawPgn(null);
      chatScreen.setScreen({ kind: 'idle' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a resume marker every time the user nudges the ply or
  // switches chapter. The writer self-prunes at ply 0 (fresh) and at
  // the chapter end (completed), so the queue only ever surfaces
  // partial reads. Failure (Dexie open error / quota) is silent -
  // the feature never blocks the lesson view.
  useEffect(() => {
    if (!chapter || !parsed) return;
    void recordLessonProgress({
      studyId: study.id,
      chapterIndex: chapterIdx,
      studyName: study.name,
      chapterTitle: chapter.title,
      currentPly: ply,
      totalPlies: parsed.moves.length,
    }).catch(() => {});
  }, [study.id, study.name, chapterIdx, chapter, parsed, ply]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className="btn-secondary text-sm">
          ← Library
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{study.name}</h2>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">
            <a
              href={`https://lichess.org/study/${study.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              lichess.org/study/{study.id}
            </a>
            {' · '}
            imported {formatRelative(study.importedAt)}
          </p>
        </div>
        {/* Study-level drill - opens the setup modal with mixed defaults
            (every chapter, 25 positions, free mode). Hidden when the parent
            doesn't wire up the mixed-drill callback. */}
        {onStartMixedDrill && (
          <button
            type="button"
            onClick={() => setDrillSetup('study')}
            className="btn-primary text-sm"
            title="Quiz yourself across the whole study - sampled positions, mixed chapters."
          >
            ▶ Drill
          </button>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="btn-secondary text-sm disabled:opacity-60"
          title="Re-fetch the study PGN from Lichess"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Chapter dropdown - Prev/Next chapter buttons live next to the
        move-nav buttons in the sidebar so the user's hand doesn't have to
        travel up to the header for them. The Export PGN button sits on
        the same row so chapter-scoped controls cluster together. */}
      <div className="flex flex-wrap items-center gap-2">
        {chapterCount > 1 && (
          <>
            <label htmlFor="chapter-pick" className="text-xs text-ink-500 dark:text-ink-400">
              Chapter
            </label>
            <select
              id="chapter-pick"
              value={chapterIdx}
              onChange={(e) => changeChapter(Number(e.target.value))}
              className="input text-sm"
            >
              {study.chapters.map((c, i) => (
                <option key={i} value={i}>
                  {i + 1}. {c.title}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-500 dark:text-ink-400">
              {chapterIdx + 1} / {chapterCount}
            </span>
          </>
        )}
        {chapter && (
          <button
            type="button"
            onClick={() => exportChapterPgn(study.name, chapter.title, chapter.pgn)}
            className="btn-ghost ml-auto text-xs"
            title="Download this chapter's PGN"
          >
            Export PGN
          </button>
        )}
      </div>

      {parseError && (
        <div className="card border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:text-red-300">
          {parseError}
        </div>
      )}

      {/*
        Mobile order (sidebar stacks under board column):
          board → nav buttons → chapter buttons → comment → move list → drill.
        Putting comment between the buttons and the move list keeps it
        BELOW the board so per-ply text-length changes never push the
        board up or down. Earlier layout put the comment above the
        board which caused exactly that jitter on phones.

        Desktop order (explicit `lg:order-*` on each sidebar child):
          board column · sidebar: move list → buttons → chapter → comment.
      */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,_1fr)_320px]">
        <div className="mx-auto flex w-full max-w-[min(80vh,_640px)] flex-col gap-2">
          {/* Mobile drill trigger - sits above the board so the
              "what to do next" CTA lands at the top of the column.
              Opens the setup modal with chapter-scope defaults.
              Desktop copy lives in the sidebar after its own comment. */}
          {onStartDrill && parsed && parsed.moves.length > 0 && (
            <button
              type="button"
              onClick={() => setDrillSetup('chapter')}
              className="btn-secondary text-xs lg:hidden"
              title="Quiz yourself on this chapter - app plays the opponent, you play your side."
            >
              ▶ Drill this chapter
            </button>
          )}
          {parsed ? (
            <div className="flex items-stretch gap-2">
              {settings.engineEnabled && (
                <div className="w-3 shrink-0 sm:w-4">
                  <EvalBar
                    snapshot={engine.snapshot}
                    orientation={orientation}
                    analyzing={engine.analyzing}
                    showCaption={false}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Board
                  fen={parsed.fens[ply] ?? parsed.startingFen}
                  orientation={orientation}
                  lastMove={lastMoveOf(parsed, ply)}
                  viewOnly
                />
              </div>
            </div>
          ) : (
            <div className="card grid aspect-square place-items-center text-sm text-muted">
              No moves in this chapter.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {parsed && (
            <>
              {/* Move-nav row - first in DOM so mobile sees it directly
                  below the board. */}
              <div className="flex gap-2 text-sm lg:order-2">
                <button
                  type="button"
                  onClick={() => setPly(0)}
                  className="btn-secondary flex-1"
                  disabled={ply === 0}
                >
                  ⏮ Start
                </button>
                <button
                  type="button"
                  onClick={() => setPly((p) => Math.max(0, p - 1))}
                  className="btn-secondary flex-1"
                  disabled={ply === 0}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPly((p) => Math.min(p + 1, parsed.moves.length))}
                  className="btn-secondary flex-1"
                  disabled={ply === parsed.moves.length}
                >
                  Next →
                </button>
                <button
                  type="button"
                  onClick={() => setPly(parsed.moves.length)}
                  className="btn-secondary flex-1"
                  disabled={ply === parsed.moves.length}
                >
                  End ⏭
                </button>
              </div>
              {chapterCount > 1 && (
                <div className="flex gap-2 text-sm lg:order-3">
                  <button
                    type="button"
                    onClick={() => changeChapter(chapterIdx - 1)}
                    disabled={chapterIdx === 0}
                    className="btn-secondary flex-1 disabled:opacity-40"
                    title="Previous chapter"
                  >
                    ← Prev chapter
                  </button>
                  <button
                    type="button"
                    onClick={() => changeChapter(chapterIdx + 1)}
                    disabled={chapterIdx >= chapterCount - 1}
                    className="btn-secondary flex-1 disabled:opacity-40"
                    title="Next chapter"
                  >
                    Next chapter →
                  </button>
                </div>
              )}
              {/* Comment slot - mobile shows it BETWEEN the chapter
                  nav and the move list (below the board) so per-ply
                  text-length changes never move the board. Desktop
                  flexes it under the move list + buttons via order-4. */}
              <LessonComment
                text={parsed.comments[ply]}
                className="lg:order-4"
              />
              {/* Move list - drops to the bottom on mobile so the buttons
                  above it stay within thumb reach. Desktop puts it back at
                  the top of the sidebar. */}
              <div className="card p-2 lg:order-1">
                <MoveList moves={parsed.moves} ply={ply} onSelectPly={setPly} />
              </div>
              {/* Desktop drill trigger - directly below the comment so the
                  "next step" CTA pairs with the lesson context. */}
              {onStartDrill && parsed.moves.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDrillSetup('chapter')}
                  className="btn-secondary hidden text-xs lg:order-5 lg:block"
                  title="Quiz yourself on this chapter - app plays the opponent, you play your side."
                >
                  ▶ Drill this chapter
                </button>
              )}
              <p className="text-[11px] text-muted lg:order-6">
                Arrow keys navigate moves. Home / End jump to chapter ends.
              </p>
            </>
          )}
        </div>
      </div>

      <DrillSetupModal
        study={study}
        open={drillSetup !== null}
        onClose={() => setDrillSetup(null)}
        initial={{
          // Per-chapter button → chapter scope, length=all (matches the
          // pre-modal behaviour). Study-level button → mixed scope, 25
          // positions (spec defaults).
          scope: drillSetup === 'study' ? 'mixed' : 'chapter',
          mode: 'free',
          side: 'white',
          length: drillSetup === 'study' ? 25 : 0,
          chapterIndices:
            drillSetup === 'study'
              ? study.chapters.map((_, i) => i)
              : [chapterIdx],
        }}
        onStart={(cfg) => {
          setDrillSetup(null);
          if (cfg.scope === 'chapter' && onStartDrill && cfg.chapterIndices.length === 1) {
            onStartDrill(cfg.chapterIndices[0], cfg.side);
            return;
          }
          if (onStartMixedDrill) {
            onStartMixedDrill(cfg);
          }
        }}
        onQueue={
          onQueueDrill
            ? (cfg) => {
                setDrillSetup(null);
                onQueueDrill(cfg);
              }
            : undefined
        }
      />
    </div>
  );
}

/**
 * Trigger a browser download for the current chapter's raw PGN. Filename
 * uses the study + chapter title, sanitised to filesystem-safe characters.
 */
function exportChapterPgn(studyName: string, chapterTitle: string, pgn: string): void {
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitiseFilename(studyName)} - ${sanitiseFilename(chapterTitle)}.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the click handler can actually use the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitiseFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'chapter';
}

function clampIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(i) || i < 0) return 0;
  return Math.min(i, count - 1);
}

function lastMoveOf(parsed: ParsedGame, ply: number): [string, string] | undefined {
  if (ply <= 0 || ply > parsed.moves.length) return undefined;
  const m = parsed.moves[ply - 1];
  return [m.from, m.to];
}

/**
 * Pick a sensible board orientation for the chapter. Heuristic:
 *   1. If chapter title says "black", orient for black.
 *   2. Else default white.
 *
 * We don't try to read the FEN tag's side-to-move because most opening
 * studies show a position from the perspective of the side being trained,
 * not the side currently to move on the first ply.
 */
function inferOrientation(parsed: ParsedGame | null, title: string): 'white' | 'black' {
  if (!parsed) return 'white';
  if (/\bblack\b/i.test(title)) return 'black';
  return 'white';
}

/**
 * Author's note for the current ply, pulled from PGN `{ ... }` comments by
 * the parser. Lichess study chapters often use these as the "lesson" text;
 * showing them under the board lets users read along while stepping through
 * moves. Hidden when the current ply has no commentary.
 */
function LessonComment({
  text,
  className,
}: {
  text: string | undefined;
  /** Extra classes - the parent uses this to push the comment above the
   *  board on mobile via flex order. */
  className?: string;
}) {
  if (!text) return null;
  return (
    <div
      className={`card whitespace-pre-line border-l-4 border-l-accent px-3 py-2 text-sm leading-relaxed text-primary ${
        className ?? ''
      }`}
    >
      {text}
    </div>
  );
}

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}
