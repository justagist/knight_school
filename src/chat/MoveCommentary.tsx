import { useMoveCommentary, type MoveCommentaryArgs } from './useMoveCommentary';
import { useOnline } from '../hooks/useOnline';

interface MoveCommentaryProps extends MoveCommentaryArgs {
  /** Hide the card entirely when there's no move to comment on. */
  visible: boolean;
}

/**
 * Single-card UI that renders Elle's commentary for the current move on the
 * Analyze screen. Cached commentary loads instantly from Dexie; a button
 * triggers a fresh call when there's nothing cached.
 */
export function MoveCommentary({ visible, ...args }: MoveCommentaryProps) {
  const commentary = useMoveCommentary(args);
  const online = useOnline();

  if (!visible) return null;

  const cached = commentary.cached;
  const canRequest = online && !commentary.loading;

  return (
    <div className="card flex flex-col gap-2 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Elle on this move
        </div>
        <div className="flex items-center gap-2">
          {cached && (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!canRequest}
              onClick={() => void commentary.request(true)}
              title={!online ? 'Network not available — reconnect to refresh.' : 'Get a fresh commentary'}
            >
              Regenerate
            </button>
          )}
          {!cached && (
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={!canRequest}
              onClick={() => void commentary.request()}
              title={!online ? 'Network not available — reconnect to ask Elle.' : 'Ask Elle to explain this move'}
            >
              {commentary.loading ? 'Asking Elle…' : 'Explain move'}
            </button>
          )}
        </div>
      </div>
      {commentary.error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {commentary.error}
        </div>
      )}
      {cached ? (
        <div className="whitespace-pre-wrap leading-relaxed">{cached.text}</div>
      ) : !commentary.loading && !commentary.error ? (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Click <em>Explain move</em> for a short take on this move from Elle. Uses your active LLM
          provider; cached after the first request.
        </p>
      ) : null}
      {cached && (
        <div className="text-[10px] text-ink-500 dark:text-ink-400">
          via {cached.provider} ({cached.model})
        </div>
      )}
    </div>
  );
}
