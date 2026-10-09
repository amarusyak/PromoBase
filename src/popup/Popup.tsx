import { useState } from 'react';
import { createRecord } from '../data/record-store';
import type { PromoCodeRecord } from '../domain/record';
import type { RecordInput } from '../domain/record-input';
import { Brand } from '../ui/Brand';
import { RETENTION_NOTICE, STORAGE_MODE_SHORT } from '../ui/copy';
import { CopyCode } from '../ui/CopyButton';
import { EMPTY_INPUT } from '../ui/draft';
import { changeFailureMessage, LIMIT_REACHED } from '../ui/messages';
import { RecordForm, type SubmitOutcome } from '../ui/RecordForm';
import { merchantName } from '../ui/record-view';
import { summarizeState } from '../ui/state-summary';
import { store } from '../ui/store';
import { useDraft } from '../ui/use-draft';
import { useStoredState } from '../ui/use-stored-state';
import { useToday } from '../ui/use-today';

export function Popup() {
  const result = useStoredState();
  const draft = useDraft();
  const today = useToday();
  const [justSaved, setJustSaved] = useState<PromoCodeRecord>();
  // The form starts from the draft once. After a save or a reset it starts blank.
  const [form, setForm] = useState({ key: 0, blank: false });

  // Both reads settle within a frame, so there is no loading state to show.
  if (result === undefined || draft === undefined) return null;

  const summary = summarizeState(result);
  const startBlank = () => setForm((current) => ({ key: current.key + 1, blank: true }));

  async function save(input: RecordInput): Promise<SubmitOutcome> {
    const outcome = await createRecord(store, input);
    if (outcome.ok) {
      draft?.forget();
      setJustSaved(outcome.record);
      startBlank();
      return { ok: true };
    }
    if (outcome.problem === 'invalid') return { ok: false, errors: outcome.errors };
    return { ok: false, message: changeFailureMessage(outcome, 'save') };
  }

  function clear() {
    draft?.forget();
    startBlank();
  }

  return (
    <main className="popup">
      <header className="popup__header">
        <h1>
          <Brand />
        </h1>
        <p className="muted">{STORAGE_MODE_SHORT}</p>
      </header>

      {summary.kind === 'problem' ? (
        <p className="problem" role="alert">
          {summary.message}
        </p>
      ) : (
        <>
          {justSaved !== undefined ? (
            <SavedTicket record={justSaved} onAddAnother={() => setJustSaved(undefined)} />
          ) : summary.atLimit ? (
            <p className="problem">{LIMIT_REACHED}</p>
          ) : (
            <section aria-labelledby="add-title" className="popup__add">
              <h2 id="add-title" className="visually-hidden">
                Add a code
              </h2>
              {draft.restored && !form.blank && (
                <p className="muted">Picking up where you left off.</p>
              )}
              <RecordForm
                key={form.key}
                initial={form.blank ? EMPTY_INPUT : draft.initial}
                records={summary.records}
                today={today}
                submitLabel="Save code"
                onSubmit={save}
                onInput={draft.remember}
                secondary={{ label: 'Clear', onClick: clear }}
                focusCode
              />
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

interface SavedTicketProps {
  record: PromoCodeRecord;
  onAddAnother: () => void;
}

/** Confirms a save, shown only after storage has accepted it (PB-014). */
function SavedTicket({ record, onAddAnother }: SavedTicketProps) {
  const merchant =
    record.merchantDomain === undefined ? undefined : merchantName(record.merchantDomain);
  return (
    <section className="ticket popup__saved" aria-labelledby="saved-title">
      <h2 id="saved-title" role="status">
        Code saved
      </h2>
      <p className="popup__saved-code">
        <CopyCode code={record.promoCode} />
      </p>
      <p>
        {merchant === undefined
          ? 'Saved without a site. You can add one in the library.'
          : `For ${merchant.name}.`}
      </p>
      <button className="button" type="button" autoFocus onClick={onAddAnother}>
        Add another
      </button>
    </section>
  );
}
