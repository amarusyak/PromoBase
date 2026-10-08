import { SpikePopupPanel } from '../spike/PopupPanel';
import { Brand } from '../ui/Brand';
import { STORAGE_MODE } from '../ui/copy';
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

      <SpikePopupPanel />

      {summary.kind === 'problem' ? (
        <p className="problem" role="alert">
          {summary.message}
        </p>
      ) : (
        <>
          <p className="popup__summary">
            <span>{summary.capacityText}</span>
            <a href="library.html" target="_blank" rel="noreferrer">
              Open spike log
            </a>
          </p>
        </>
      )}
    </main>
  );
}
