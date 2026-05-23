import { useState } from 'react';
import { extractStudyId, importStudy } from './lichessStudy';
import { notifyStudiesChanged } from './useStudies';

interface StudyImporterProps {
  /** Fires after a successful import so the page can switch to the viewer. */
  onImported?: (studyId: string) => void;
}

/**
 * Paste-a-URL importer for Lichess studies. Accepts a full
 * https://lichess.org/study/{id} URL or a bare 8-char slug.
 *
 * No live token check — the fetch itself will surface the right error.
 * Public studies work without a token; private ones require one with access.
 */
export function StudyImporter({ onImported }: StudyImporterProps) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'importing' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const id = extractStudyId(input);
    if (!id) {
      setStatus('error');
      setMessage('Paste a Lichess study URL or 8-character study id.');
      return;
    }
    setStatus('importing');
    try {
      const row = await importStudy(id);
      notifyStudiesChanged();
      setStatus('idle');
      setInput('');
      setMessage(null);
      onImported?.(row.id);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  const importing = status === 'importing';

  return (
    <form onSubmit={submit} className="card flex flex-col gap-2 p-3">
      <label htmlFor="study-url" className="text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-400">
        Import a Lichess study
      </label>
      <div className="flex gap-2">
        <input
          id="study-url"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://lichess.org/study/abc12345 or abc12345"
          className="input flex-1"
          disabled={importing}
        />
        <button
          type="submit"
          className="btn-primary px-3 text-sm"
          disabled={importing || !input.trim()}
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-ink-500 dark:text-ink-400'}`}>
          {message}
        </p>
      )}
      <p className="text-[11px] text-ink-500 dark:text-ink-400">
        Public studies import without a token. Private studies require a Lichess token with access (set in Settings).
      </p>
    </form>
  );
}
