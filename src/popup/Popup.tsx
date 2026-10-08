import { Brand } from '../ui/Brand';
import { RETENTION_NOTICE, STORAGE_MODE } from '../ui/copy';
import { summarizeState } from '../ui/state-summary';
import { useStoredState } from '../ui/use-stored-state';

export function Popup() {
  const result = useStoredState();
  // The storage read settles within a frame, so there is no loading state to show.
  if (result === undefined) return null;

  const summary = summarizeState(result);

  return (
    <main className="popup">
      <header className="popup__header">
        <h1>
          <Brand />
        </h1>
        <p className="muted">{STORAGE_MODE}</p>
      </header>

      {summary.kind === 'problem' ? (
        <p className="problem" role="alert">
          {summary.message}
        </p>
      ) : (
        <>
          {summary.savedCount === 0 && (
            <section className="ticket" aria-labelledby="welcome-title">
              <h2 id="welcome-title">No codes saved yet</h2>
              <p>Save a promo code once and PromoBase brings it back when you visit the store.</p>
              <button className="button" type="button" disabled aria-describedby="add-code-status">
                Add a code
              </button>
              <p id="add-code-status" className="muted">
                Adding codes arrives in the next build.
              </p>
            </section>
          )}
          <p className="popup__summary">
            <span>{summary.capacityText}</span>
            <a href="library.html" target="_blank" rel="noreferrer">
              Open library
            </a>
          </p>
        </>
      )}

      <p className="popup__notice muted">{RETENTION_NOTICE}</p>
    </main>
  );
}
