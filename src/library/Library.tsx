import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRecord, deleteRecord, importRecords, updateRecord } from '../data/record-store';
import type { PromoCodeRecord } from '../domain/record';
import { recordToInput, type RecordInput } from '../domain/record-input';
import { readStoredValue } from '../data/load-state';
import {
  exportDocument,
  exportFileName,
  exportText,
  savedDataFileName,
  savedDataText,
} from '../domain/export';
import { importTooLarge, parseImport } from '../domain/import';
import { searchRecords } from '../domain/record-list';
import { reminderDomains, siteReminderState } from '../domain/site-reminders';
import { isPinned } from '../platform/action';
import { downloadFile } from '../platform/download';
import { chromeSiteAccess } from '../platform/site-access';
import { Brand } from '../ui/Brand';
import {
  BUTTON_TIPS,
  NOT_CHECKED,
  retentionNotice,
  SAVE_COPY,
  STORAGE_MODE,
  WELCOME,
} from '../ui/copy';
import { CopyCode } from '../ui/CopyButton';
import { EMPTY_INPUT } from '../ui/draft';
import { importReport, type ImportReport } from '../ui/import-report';
import {
  ACCESS_REQUEST_FAILED,
  changeFailureMessage,
  importFailureMessage,
  importProblemMessage,
  savedCopyMessage,
  LIMIT_REACHED,
} from '../ui/messages';
import { RecordForm, type SubmitOutcome } from '../ui/RecordForm';
import { groupRecords, merchantName, type RecordView } from '../ui/record-view';
import { waitingSitesText } from '../ui/reminder-view';
import { summarizeState } from '../ui/state-summary';
import { Tooltip } from '../ui/Tooltip';
import { store } from '../ui/store';
import { SiteReminder } from '../ui/SiteReminder';
import { useNotice } from '../ui/use-notice';
import { useSiteAccess } from '../ui/use-site-access';
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
  const [notice, showNotice] = useNotice();
  const [failure, setFailure] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const deleteUnderWay = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pinned, setPinned] = useState<boolean>();
  useEffect(() => {
    void isPinned().then(setPinned);
  }, []);
  const [report, setReport] = useState<ImportReport>();
  const [importing, setImporting] = useState(false);
  const loaded = result?.status === 'ok' ? result.state.records : [];
  const access = useSiteAccess(loaded.flatMap((record) => record.merchantDomain ?? []));

  if (result === undefined) return null;

  const summary = summarizeState(result);
  if (summary.kind === 'problem') {
    return (
      <Page readable={false}>
        <UnreadableData
          key={summary.message}
          message={summary.message}
          canSaveCopy={summary.canSaveCopy}
          offerReport={summary.offerReport}
        />
      </Page>
    );
  }

  const { records } = summary;
  const matches = searchRecords(records, query);
  const groups = groupRecords(matches, today);
  const searching = query.trim() !== '';

  /**
   * Adds the codes of an export (D-027). The file is checked whole before
   * anything is saved; saved codes are never changed. What was skipped is
   * reported and stays on screen until dismissed (owner's trial of E1).
   */
  async function importFile(file: File) {
    if (importing) return;
    setImporting(true);
    setReport(undefined);
    setFailure(undefined);
    try {
      // Checked from the file's size alone, before anything is read (review of PR #8).
      if (importTooLarge(file.size)) {
        setFailure(importProblemMessage('too-large'));
        return;
      }
      const parsed = parseImport(await file.text());
      if (!parsed.ok) {
        setFailure(importProblemMessage(parsed.problem, parsed.record));
        return;
      }
      const outcome = await importRecords(store, parsed.records);
      if (outcome.ok) setReport(importReport(outcome.plan));
      else setFailure(importFailureMessage(outcome));
    } catch {
      setFailure(importProblemMessage('not-json'));
    } finally {
      setImporting(false);
    }
  }

  /** Downloads every saved code as JSON (D-027). Nothing leaves the computer. */
  function exportCodes() {
    const now = new Date();
    downloadFile(exportFileName(now), exportText(exportDocument(records, now)));
    setFailure(undefined);
    // Short, so the bar does not wrap; Chrome's own download bubble names the file.
    showNotice(`Exported ${records.length} ${records.length === 1 ? 'code' : 'codes'}.`);
  }

  /** The reminder switch of a row's site (D-100), once Chrome has said what access there is. */
  function reminderFor(id: string): ReactNode {
    const domain = records.find((record) => record.id === id)?.merchantDomain;
    if (domain === undefined || access === undefined) return null;
    return (
      <SiteReminder
        domain={domain}
        state={siteReminderState(records, domain, access.get(domain) ?? false)}
        compact
      />
    );
  }

  async function save(input: RecordInput): Promise<SubmitOutcome> {
    const outcome =
      editing?.kind === 'edit'
        ? await updateRecord(store, editing.record.id, input)
        : await createRecord(store, input);
    if (outcome.ok) {
      setEditing(undefined);
      setFailure(undefined);
      showNotice(`Saved ${outcome.record.promoCode}.`);
      return { ok: true };
    }
    if (outcome.problem === 'invalid') return { ok: false, errors: outcome.errors };
    return { ok: false, message: changeFailureMessage(outcome, 'save') };
  }

  async function remove(id: string) {
    // A second click while the first delete is under way would find the record
    // gone and report that as a failure, over the notice of the delete that worked.
    if (deleteUnderWay.current) return;
    deleteUnderWay.current = true;
    setDeleting(true);
    const outcome = await deleteRecord(store, id);
    deleteUnderWay.current = false;
    setDeleting(false);
    // Another row may have been asked about in the meantime; leave that question open.
    setConfirming((current) => (current === id ? undefined : current));
    if (outcome.ok) {
      setFailure(undefined);
      showNotice(`Deleted ${outcome.record.promoCode}.`);
    } else {
      showNotice('');
      setFailure(changeFailureMessage(outcome, 'delete'));
    }
    // The row that held the focus is gone or changed; keep the focus in the list.
    list.current?.focus();
  }

  return (
    <Page>
      <div className="library__bar">
        <p>
          {summary.capacityText}
          {/* Next to the count, so nothing below moves when it appears or goes away. */}
          <span className="library__notice" role="status">
            {notice}
          </span>
        </p>
        <span className="library__actions">
          <Tooltip text={BUTTON_TIPS.import}>
            {(tip) => (
              <button
                className="button button--quiet"
                type="button"
                disabled={importing}
                aria-describedby={tip}
                onClick={() => fileInput.current?.click()}
              >
                Import
              </button>
            )}
          </Tooltip>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared, so choosing the same file again is noticed.
              event.target.value = '';
              if (file !== undefined) void importFile(file);
            }}
          />
          {records.length > 0 && (
            <Tooltip text={BUTTON_TIPS.export}>
              {(tip) => (
                <button
                  className="button button--quiet"
                  type="button"
                  aria-describedby={tip}
                  onClick={exportCodes}
                >
                  Export
                </button>
              )}
            </Tooltip>
          )}
          <Tooltip text={BUTTON_TIPS.add}>
            {(tip) => (
              <button
                className="button"
                type="button"
                disabled={summary.atLimit}
                aria-describedby={summary.atLimit ? `${tip} limit-reached` : tip}
                onClick={() => setEditing({ kind: 'add' })}
              >
                Add a code
              </button>
            )}
          </Tooltip>
        </span>
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

      {report !== undefined && (
        <section className="library__report" role="status" aria-label="Import result">
          <p>
            <strong>{report.summary}</strong>
          </p>
          {report.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <button className="link" type="button" onClick={() => setReport(undefined)}>
            Dismiss
          </button>
        </section>
      )}

      <WaitingSites
        sites={
          access === undefined
            ? []
            : reminderDomains(records).filter((domain) => access.get(domain) === false)
        }
      />

      {failure !== undefined && (
        // Stays until the next change or until dismissed (D-090, owner's trial of E1).
        <div className="problem library__problem" role="alert">
          <p>{failure}</p>
          <button className="link" type="button" onClick={() => setFailure(undefined)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="library__list" ref={list} tabIndex={-1}>
        {records.length === 0 ? (
          // The welcome on first launch, and whenever the library is empty (PB-001).
          <section className="ticket library__empty" aria-labelledby="empty-title">
            <h2 id="empty-title">{WELCOME.title}</h2>
            <p>{WELCOME.intro}</p>
            <ul className="library__points">
              {WELCOME.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <button className="button" type="button" onClick={() => setEditing({ kind: 'add' })}>
              Add your first code
            </button>
            {pinned === false && <p className="library__pin">{WELCOME.pinHint}</p>}
            <p className="muted">{WELCOME.importHint}</p>
            <p className="muted">{NOT_CHECKED}</p>
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
                    reminder={reminderFor(row.id)}
                    confirming={confirming === row.id}
                    deleting={deleting}
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

/**
 * Sites with reminders on that Chrome has not given access to, for example
 * after an import. One click asks for all of them in a single Chrome dialog,
 * after PromoBase's own explanation (D-061). One such site is handled in its
 * own row.
 */
function WaitingSites({ sites }: { sites: string[] }) {
  const [failed, setFailed] = useState(false);
  if (sites.length < 2) return null;
  const { text, action } = waitingSitesText(sites.map((domain) => merchantName(domain).name));
  return (
    <section className="library__waiting" aria-label="Reminders waiting for Chrome's permission">
      <p>{text}</p>
      <button
        className="button"
        type="button"
        onClick={() =>
          void chromeSiteAccess.requestAll(sites).then((answer) => setFailed(answer === 'failed'))
        }
      >
        {action}
      </button>
      {failed && (
        <p className="problem" role="alert">
          {ACCESS_REQUEST_FAILED}
        </p>
      )}
    </section>
  );
}

/** The frame every state of the library shares. */
/**
 * Saved codes this build cannot read (D-042): the message, and a way to keep
 * them safe (D-124). The copy is the stored value as it is; nothing is changed.
 */
function UnreadableData({
  message,
  canSaveCopy,
  offerReport,
}: {
  message: string;
  canSaveCopy: boolean;
  offerReport: boolean;
}) {
  const [saved, setSaved] = useState<string>();
  const saveCopy = async () => {
    const read = await readStoredValue(store.store);
    if (!read.ok) {
      setSaved(savedCopyMessage(read));
      return;
    }
    downloadFile(savedDataFileName(new Date()), savedDataText(read.value));
    setSaved(savedCopyMessage({ ok: true }));
  };
  return (
    <section className="problem library__unreadable" role="alert">
      <p>{message}</p>
      {(canSaveCopy || offerReport) && (
        <p className="library__unreadable-actions">
          {canSaveCopy && (
            <button className="button" type="button" onClick={() => void saveCopy()}>
              {SAVE_COPY.button}
            </button>
          )}
          {offerReport && (
            <a href={SAVE_COPY.issuesUrl} target="_blank" rel="noreferrer">
              {SAVE_COPY.issuesLink}
            </a>
          )}
        </p>
      )}
      {saved !== undefined && (
        <p className="muted" role="status">
          {saved}
        </p>
      )}
    </section>
  );
}

function Page({ children, readable = true }: { children: ReactNode; readable?: boolean }) {
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
        <p className="muted">{retentionNotice(readable)}</p>
        <p className="muted">{NOT_CHECKED}</p>
      </section>
    </main>
  );
}

interface CodeTicketProps {
  row: RecordView;
  /** The reminder switch of the code's site, if it has one. */
  reminder: ReactNode;
  /** True while this row asks whether it should really be deleted (PB-011). */
  confirming: boolean;
  /** True while a delete is under way; the answer cannot be given twice. */
  deleting: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onDelete: () => void;
}

/** One saved code, drawn as a ticket: details on the left, the code on its stub. */
function CodeTicket({
  row,
  reminder,
  confirming,
  deleting,
  onEdit,
  onAskDelete,
  onKeep,
  onDelete,
}: CodeTicketProps) {
  const keep = useRef<HTMLButtonElement>(null);

  // The question appears where Delete was; put the focus on the safe answer. If
  // it opens while another row's delete is still under way, the answer is
  // disabled and cannot take the focus yet, so this runs again once it can.
  useEffect(() => {
    if (confirming && !deleting) keep.current?.focus();
  }, [confirming, deleting]);

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
        {reminder}
        {confirming ? (
          <div className="code-ticket__actions" role="group" aria-label={`Delete ${row.code}?`}>
            <span>Delete this code?</span>
            <button
              className="button button--danger"
              type="button"
              disabled={deleting}
              onClick={onDelete}
            >
              Delete
            </button>
            <button
              className="button button--quiet"
              type="button"
              ref={keep}
              disabled={deleting}
              onClick={onKeep}
            >
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
