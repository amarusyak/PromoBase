import { SpikeLibraryPanel } from '../spike/LibraryPanel';
import { Brand } from '../ui/Brand';
import { RETENTION_NOTICE, STORAGE_MODE } from '../ui/copy';
import { summarizeState } from '../ui/state-summary';
import { useStoredState } from '../ui/use-stored-state';

export function Library() {
  const result = useStoredState();
  if (result === undefined) return null;

  const summary = summarizeState(result);

  return (
    <main className="library">
      <header className="library__header">
        <Brand />
        <h1>Library</h1>
        <p className="muted">{STORAGE_MODE}</p>
      </header>

      {summary.kind === 'problem' ? (
        <p className="problem" role="alert">
          {summary.message}
        </p>
      ) : (
        <p>{summary.capacityText}</p>
      )}

      <SpikeLibraryPanel />

      <section className="library__about" aria-labelledby="about-title">
        <h2 id="about-title">About your saved codes</h2>
        <p className="muted">{RETENTION_NOTICE}</p>
      </section>
    </main>
  );
}
