import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRecord, deleteRecord, updateRecord } from '../data/record-store';
import type { PromoCodeRecord } from '../domain/record';
import { recordToInput, type RecordInput } from '../domain/record-input';
import { searchRecords } from '../domain/record-list';
import { Brand } from '../ui/Brand';
import { RETENTION_NOTICE, STORAGE_MODE } from '../ui/copy';
import { CopyCode } from '../ui/CopyButton';
import { EMPTY_INPUT } from '../ui/draft';
import { changeFailureMessage, LIMIT_REACHED } from '../ui/messages';
import { RecordForm, type SubmitOutcome } from '../ui/RecordForm';
import { groupRecords, type RecordView } from '../ui/record-view';
import { summarizeState } from '../ui/state-summary';
import { store } from '../ui/store';
import { useStoredState } from '../ui/use-stored-state';
import { useToday } from '../ui/use-today';

/** The form that is open in the dialog, if any. */
type Editing = { kind: 'add' } | { kind: 'edit'; record: PromoCodeRecord };

export function Library() {
  const result = useStoredState();
  const today = useToday();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>();
  const [confirming, setConfirming] = useState<string>();
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState<string>();
  const list = useRef<HTMLDivElement>(null);

  if (result === undefined) return null;

  const summary = summarizeState(result);
  if (summary.kind === 'problem') {
    return (
      <Page>
        <p className="problem" role="alert">
          {summary.message}
        </p>
      </Page>
    );
  }

  const { records } = summary;
  const matches = searchRecords(records, query);
  const groups = groupRecords(matches, today);
  const searching = query.trim() !== '';

  async function save(input: RecordInput): Promise<SubmitOutcome> {
    const outcome =
      editing?.kind === 'edit'
        ? await updateRecord(store, editing.record.id, input)
        : await createRecord(store, input);
    if (outcome.ok) {
      setEditing(undefined);
      setFailure(undefined);
      setNotice(`Saved ${outcome.record.promoCode}.`);
      return { ok: true };
    }
    if (outcome.problem === 'invalid') return { ok: false, errors: outcome.errors };
    return { ok: false, message: changeFailureMessage(outcome, 'save') };
  }

  async function remove(id: string) {
    const outcome = await deleteRecord(store, id);
    setConfirming(undefined);
    if (outcome.ok) {
      setFailure(undefined);
      setNotice(`Deleted ${outcome.record.promoCode}.`);
    } else {
      setNotice('');
      setFailure(changeFailureMessage(outcome, 'delete'));
    }
    // The row that held the focus is gone or changed; keep the focus in the list.
    list.current?.focus();
  }

  return (
    <Page>
      <div className="library__bar">
        <p>{summary.capacityText}</p>
        <button
          className="button"
          type="button"
          disabled={summary.atLimit}
          aria-describedby={summary.atLimit ? 'limit-reached' : undefined}
          onClick={() => setEditing({ kind: 'add' })}
        >
          Add a code
        </button>
      </div>
      {summary.atLimit && (
        <p className="problem" id="limit-reached">
          {LIMIT_REACHED}
        </p>
      )}

      {records.length > 0 && (
        <div className="library__search">
          <input
            className="field__input"
            type="search"
            aria-label="Search saved codes"
            placeholder="Search codes, sites and notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="muted" role="status">
            {searching && `${matches.length} of ${records.length} codes match.`}
          </p>
        </div>
      )}

      <p className="library__notice" role="status">
        {notice}
      </p>
      {failure !== undefined && (
        <p className="problem" role="alert">
          {failure}
        </p>
      )}

      <div className="library__list" ref={list} tabIndex={-1}>
        {records.length === 0 ? (
          <section className="ticket library__empty" aria-labelledby="empty-title">
            <h2 id="empty-title">No codes saved yet</h2>
            <p>
              Save a promo code with the store it belongs to. Use Add a code here, or the PromoBase
              button in the Chrome toolbar while you browse.
            </p>
          </section>
        ) : groups.length === 0 ? (
          <section className="library__empty" aria-labelledby="none-title">
            <h2 id="none-title">No codes match “{query.trim()}”</h2>
            <p>Search looks at the code, the site and the note.</p>
            <button className="button button--quiet" type="button" onClick={() => setQuery('')}>
              Clear search
            </button>
          </section>
        ) : (
          groups.map((group) => (
            <section key={group.status} aria-labelledby={`group-${group.status}`}>
              <h2 id={`group-${group.status}`} className="library__group">
                {group.label} <span className="muted">{group.rows.length}</span>
              </h2>
              <ul className="library__rows">
                {group.rows.map((row) => (
                  <CodeTicket
                    key={row.id}
                    row={row}
                    confirming={confirming === row.id}
                    onEdit={() => {
                      const record = records.find((candidate) => candidate.id === row.id);
                      if (record !== undefined) setEditing({ kind: 'edit', record });
                    }}
                    onAskDelete={() => setConfirming(row.id)}
                    onKeep={() => setConfirming(undefined)}
                    onDelete={() => void remove(row.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {editing !== undefined && (
        <FormDialog
          title={editing.kind === 'edit' ? 'Edit code' : 'Add a code'}
          onClose={() => setEditing(undefined)}
        >
          <RecordForm
            initial={editing.kind === 'edit' ? recordToInput(editing.record) : EMPTY_INPUT}
            {...(editing.kind === 'edit' ? { saved: editing.record } : {})}
            records={records}
            today={today}
            submitLabel={editing.kind === 'edit' ? 'Save changes' : 'Save code'}
            onSubmit={save}
            secondary={{ label: 'Cancel', onClick: () => setEditing(undefined) }}
            focusCode
          />
        </FormDialog>
      )}
    </Page>
  );
}

/** The frame every state of the library shares. */
function Page({ children }: { children: ReactNode }) {
  return (
    <main className="library">
      <header className="library__header">
        <Brand />
        <h1>Library</h1>
        <p className="muted">{STORAGE_MODE}</p>
      </header>
      {children}
      <section className="library__about" aria-labelledby="about-title">
        <h2 id="about-title">About your saved codes</h2>
        <p className="muted">{RETENTION_NOTICE}</p>
      </section>
    </main>
  );
}

interface CodeTicketProps {
  row: RecordView;
  /** True while this row asks whether it should really be deleted (PB-011). */
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onDelete: () => void;
}

/** One saved code, drawn as a ticket: details on the left, the code on its stub. */
function CodeTicket({ row, confirming, onEdit, onAskDelete, onKeep, onDelete }: CodeTicketProps) {
  const keep = useRef<HTMLButtonElement>(null);

  // The question appears where Delete was; put the focus on the safe answer.
  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);

  return (
    <li className={`code-ticket code-ticket--${row.status}`}>
      <div className="code-ticket__main">
        <p className="code-ticket__merchant">
          {row.merchant === undefined ? (
            <span className="muted">No site</span>
          ) : (
            <>
              {row.merchant.name}
              {row.merchant.stored !== undefined && (
                <span className="muted"> ({row.merchant.stored})</span>
              )}
            </>
          )}
        </p>
        {/* The group heading says Active; a tag marks only what calls for care. */}
        {row.status !== 'active' && (
          <p className={`status status--${row.status}`}>{row.statusLabel}</p>
        )}
        {row.note !== undefined && <p className="code-ticket__note">{row.note}</p>}
        {row.dates !== undefined && <p className="code-ticket__dates muted">{row.dates}</p>}
        {confirming ? (
          <div className="code-ticket__actions" role="group" aria-label={`Delete ${row.code}?`}>
            <span>Delete this code?</span>
            <button className="button button--danger" type="button" onClick={onDelete}>
              Delete
            </button>
            <button className="button button--quiet" type="button" ref={keep} onClick={onKeep}>
              Keep
            </button>
          </div>
        ) : (
          <p className="code-ticket__actions">
            <button className="link" type="button" aria-label={`Edit ${row.code}`} onClick={onEdit}>
              Edit
            </button>
            <button
              className="link"
              type="button"
              aria-label={`Delete ${row.code}`}
              onClick={onAskDelete}
            >
              Delete
            </button>
          </p>
        )}
      </div>
      <div className="code-ticket__stub">
        <CopyCode code={row.code} />
      </div>
    </li>
  );
}

interface FormDialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A modal dialog: the browser keeps the focus inside it and closes it on Escape. */
function FormDialog({ title, onClose, children }: FormDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closed = useRef(onClose);

  useEffect(() => {
    closed.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    // Listened to here and not through React, so that taking the dialog down in
    // the clean-up below is not reported as the user closing it.
    const onClosed = () => closed.current();
    element.addEventListener('close', onClosed);
    element.showModal();
    return () => {
      element.removeEventListener('close', onClosed);
      element.close();
    };
  }, []);

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="dialog-title">
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
