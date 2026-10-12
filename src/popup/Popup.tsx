import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createRecord } from '../data/record-store';
import type { PromoCodeRecord } from '../domain/record';
import type { RecordInput } from '../domain/record-input';
import { searchRecords, sortRecords } from '../domain/record-list';
import { recordsForHost } from '../domain/site-codes';
import { CodeCard } from '../ui/CodeCard';
import { RETENTION_NOTICE, STORAGE_MODE_SHORT } from '../ui/copy';
import { CopyCode } from '../ui/CopyButton';
import { EMPTY_INPUT, isBlankInput } from '../ui/draft';
import { changeFailureMessage, LIMIT_REACHED } from '../ui/messages';
import { RecordForm, type SubmitOutcome } from '../ui/RecordForm';
import { merchantName, viewRecord } from '../ui/record-view';
import { openingTab, siteLabel, type PopupTab, type SiteLabel } from '../ui/site-view';
import { summarizeState } from '../ui/state-summary';
import { store } from '../ui/store';
import { useDraft, type Draft } from '../ui/use-draft';
import { usePopupContext, type PopupContext } from '../ui/use-popup-context';
import { useStoredState } from '../ui/use-stored-state';
import { useToday } from '../ui/use-today';

export function Popup() {
  const result = useStoredState();
  const draft = useDraft();
  const context = usePopupContext();

  // All three reads settle within a frame, so there is no loading state to show.
  if (result === undefined || draft === undefined || context === undefined) return null;

  const summary = summarizeState(result);
  return (
    <main className="popup">
      <h1 className="visually-hidden">PromoBase</h1>
      {summary.kind === 'problem' ? (
        <p className="problem" role="alert">
          {summary.message}
        </p>
      ) : (
        <Tabs records={summary.records} atLimit={summary.atLimit} draft={draft} context={context} />
      )}
      {summary.kind === 'ready' && (
        <p className="popup__summary">
          <span>{summary.capacityText}</span>
          <a href="library.html" target="_blank" rel="noreferrer">
            Open library
          </a>
        </p>
      )}
      <p className="popup__notice muted">
        {STORAGE_MODE_SHORT}. {RETENTION_NOTICE}
      </p>
    </main>
  );
}

const TAB_ORDER: readonly PopupTab[] = ['site', 'all', 'add'];

interface TabsProps {
  records: PromoCodeRecord[];
  atLimit: boolean;
  draft: Draft;
  context: PopupContext;
}

/** The popup's three tabs (D-092). All stay mounted, so switching keeps what was typed. */
function Tabs({ records, atLimit, draft, context }: TabsProps) {
  const today = useToday();
  const { host } = context;
  const site = host === undefined ? undefined : siteLabel(host);
  const siteRecords = host === undefined ? [] : sortRecords(recordsForHost(records, host), today);

  // Chosen once, when the popup opens; a save in the Add tab must not move the person away.
  const [tab, setTab] = useState<PopupTab>(() => openingTab(siteRecords.length));
  const tabButtons = useRef<Partial<Record<PopupTab, HTMLButtonElement | null>>>({});

  const [justSaved, setJustSaved] = useState<PromoCodeRecord>();
  const [form, setForm] = useState({ key: 0, initial: draft.initial });
  const latest = useRef(draft.initial);
  const [query, setQuery] = useState('');

  function remember(input: RecordInput) {
    latest.current = input;
    draft.remember(input);
  }

  function restartForm(initial: RecordInput) {
    latest.current = initial;
    draft.remember(initial);
    setForm((current) => ({ key: current.key + 1, initial }));
  }

  async function save(input: RecordInput): Promise<SubmitOutcome> {
    const outcome = await createRecord(store, input);
    if (outcome.ok) {
      draft.forget();
      latest.current = EMPTY_INPUT;
      setJustSaved(outcome.record);
      setForm((current) => ({ key: current.key + 1, initial: EMPTY_INPUT }));
      return { ok: true };
    }
    if (outcome.problem === 'invalid') return { ok: false, errors: outcome.errors };
    return { ok: false, message: changeFailureMessage(outcome, 'save') };
  }

  /** Opens the form with this site as the address, unless an unfinished entry already has one. */
  function addForSite(label: SiteLabel) {
    const current = latest.current;
    setJustSaved(undefined);
    if (label.address !== undefined && current.resourceUrl.trim() === '') {
      restartForm({ ...current, resourceUrl: label.address });
    } else {
      setForm((now) => ({ key: now.key + 1, initial: current }));
    }
    setTab('add');
  }

  function choose(next: PopupTab, moveFocus: boolean) {
    setTab(next);
    if (moveFocus) tabButtons.current[next]?.focus();
  }

  // Arrow keys move between the tabs, as in any tab list.
  function onTabKey(event: KeyboardEvent) {
    const index = TAB_ORDER.indexOf(tab);
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let next: PopupTab | undefined;
    if (event.key in step) {
      next = TAB_ORDER[(index + (step[event.key] ?? 0) + TAB_ORDER.length) % TAB_ORDER.length];
    } else if (event.key === 'Home') next = TAB_ORDER[0];
    else if (event.key === 'End') next = TAB_ORDER.at(-1);
    if (next === undefined) return;
    event.preventDefault();
    choose(next, true);
  }

  function tabButton(id: PopupTab, label: string, count?: number) {
    const selected = tab === id;
    return (
      <button
        ref={(element) => {
          tabButtons.current[id] = element;
        }}
        id={`tab-${id}`}
        className="popup__tab"
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={`panel-${id}`}
        tabIndex={selected ? 0 : -1}
        onClick={() => choose(id, false)}
      >
        {label}
        {count !== undefined && count > 0 && <span className="popup__count">{count}</span>}
      </button>
    );
  }

  const results = sortRecords(searchRecords(records, query), today);
  const searching = query.trim() !== '';

  return (
    <>
      <div className="popup__top">
        <span className="brand__mark" aria-hidden="true" />
        <div className="popup__tabs" role="tablist" aria-label="PromoBase" onKeyDown={onTabKey}>
          {tabButton('site', 'This site', siteRecords.length)}
          {tabButton('all', 'All codes', records.length)}
          {tabButton('add', 'Add')}
        </div>
      </div>

      <Panel id="site" shown={tab === 'site'}>
        {host === undefined || site === undefined ? (
          <p className="muted">
            This tab is not a website. Open a shop&apos;s site and its saved codes show up here.
          </p>
        ) : siteRecords.length === 0 ? (
          <>
            <p>No codes saved for {site.name}.</p>
            {site.address !== undefined && !atLimit && (
              <button className="button" type="button" onClick={() => addForSite(site)}>
                Add a code for {site.name}
              </button>
            )}
          </>
        ) : (
          <>
            <h2 className="popup__heading">Codes for {site.name}</h2>
            <ul className="code-cards popup__scroll">
              {siteRecords.map((record) => (
                <CodeCard key={record.id} row={viewRecord(record, today)} />
              ))}
            </ul>
            {site.address !== undefined && !atLimit && (
              <button
                className="button button--quiet"
                type="button"
                onClick={() => addForSite(site)}
              >
                Add another code for {site.name}
              </button>
            )}
          </>
        )}
        {context.pinned === false && (
          <p className="popup__hint muted">
            Pin PromoBase to the toolbar to see its icon change on sites you have codes for.
          </p>
        )}
      </Panel>

      <Panel id="all" shown={tab === 'all'}>
        {records.length === 0 ? (
          <>
            <p>No codes saved yet.</p>
            <button className="button" type="button" onClick={() => choose('add', true)}>
              Add a code
            </button>
          </>
        ) : (
          <>
            <input
              className="field__input"
              type="search"
              aria-label="Search saved codes"
              placeholder="Search codes, sites and notes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="visually-hidden" role="status">
              {searching && `${results.length} of ${records.length} codes match.`}
            </p>
            {results.length === 0 ? (
              <p>
                No codes match “{query.trim()}”.{' '}
                <button className="link" type="button" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </p>
            ) : (
              <ul className="code-cards popup__scroll">
                {results.map((record) => (
                  <CodeCard key={record.id} row={viewRecord(record, today)} />
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>

      <Panel id="add" shown={tab === 'add'}>
        {justSaved !== undefined ? (
          <SavedTicket record={justSaved} onAddAnother={() => setJustSaved(undefined)} />
        ) : atLimit ? (
          <p className="problem">{LIMIT_REACHED}</p>
        ) : (
          <RecordForm
            key={form.key}
            initial={form.initial}
            records={records}
            today={today}
            submitLabel="Save code"
            onSubmit={save}
            onInput={remember}
            secondary={{ label: 'Clear', onClick: () => restartForm(EMPTY_INPUT) }}
            focusCode={tab === 'add'}
            actionsNote={
              draft.restored && form.key === 0 && !isBlankInput(form.initial)
                ? 'Picking up where you left off.'
                : undefined
            }
          />
        )}
      </Panel>
    </>
  );
}

function Panel({ id, shown, children }: { id: PopupTab; shown: boolean; children: ReactNode }) {
  return (
    <section
      id={`panel-${id}`}
      className="popup__panel"
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={!shown}
    >
      {children}
    </section>
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
