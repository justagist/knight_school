import { useRef, useState } from 'react';
import { SAMPLE_GAMES } from '../lib/sampleGames';

interface PgnImportProps {
  onLoad: (pgn: string) => void;
  /** Optional error to display (e.g. from a failed parse upstream) */
  error?: string;
}

export function PgnImport({ onLoad, error }: PgnImportProps) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const content = await file.text();
    setText(content);
    onLoad(content);
  };

  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
          Load a game
        </h2>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          Paste a PGN, upload a <code>.pgn</code> file, or pick a sample to explore the board.
        </p>
      </div>

      <textarea
        className="input min-h-[120px] font-mono text-xs"
        placeholder={'[Event "..."]\n[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary text-xs"
          onClick={() => onLoad(text)}
          disabled={!text.trim()}
        >
          Load PGN
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => fileRef.current?.click()}
        >
          Upload .pgn file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        {text && (
          <button type="button" className="btn-ghost text-xs" onClick={() => setText('')}>
            Clear
          </button>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <div className="text-xs uppercase tracking-wide text-muted">Or try a sample game</div>
        <ul className="mt-2 flex flex-col gap-2">
          {SAMPLE_GAMES.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => {
                  setText(g.pgn);
                  onLoad(g.pgn);
                }}
                title={g.label}
                className="card flex w-full min-h-[44px] items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:border-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-primary">{g.title}</div>
                  <div className="truncate text-[11px] text-muted">{g.subtitle}</div>
                </div>
                <span className="text-xs text-accent" aria-hidden>
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
