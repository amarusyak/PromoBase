import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NOTE_MAX_LENGTH, type PromoCodeRecord } from '../domain/record';
import {
  fieldsForEdit,
  previewMerchantDomain,
  recordWarnings,
  validateRecordInput,
  type RecordInput,
  type RecordInputErrors,
} from '../domain/record-input';
import { completeDateYear, maskDateInput } from './date-mask';
import { errorMessages, warningMessage } from './messages';
import { merchantName } from './record-view';
import './record-form.css';

export type SubmitOutcome =
  | { ok: true }
  /** Fields to correct; the form shows a sentence under each. */
  | { ok: false; errors: RecordInputErrors }
  /** The save itself did not go through; the form keeps what was entered (PB-014). */
  | { ok: false; message: string };

interface RecordFormProps {
  initial: RecordInput;
  /** The record being edited. Absent when a new one is added. */
  saved?: PromoCodeRecord;
  /** All saved records, for the duplicate warning. */
  records: readonly PromoCodeRecord[];
  today: string;
  submitLabel: string;
  onSubmit: (input: RecordInput) => Promise<SubmitOutcome>;
  /** Called with the form contents after every change. */
  onInput?: (input: RecordInput) => void;
  /** Shows a second button with this label next to the save button. */
  secondary?: { label: string; onClick: () => void };
  /** Puts the cursor in the code field when the form appears. */
  focusCode?: boolean;
}

/** A field whose error also clears when this one is edited, because the two are checked together. */
const CHECKED_TOGETHER: Partial<Record<keyof RecordInput, keyof RecordInput>> = {
  startDate: 'expiryDate',
  resourceUrl: 'merchantDomain',
};

/** The form for adding or editing a promo code (PB-004, PB-010). */
export function RecordForm({
  initial,
  saved,
  records,
  today,
  submitLabel,
  onSubmit,
  onInput,
  secondary,
  focusCode = false,
}: RecordFormProps) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const [input, setInput] = useState(initial);
  const [errors, setErrors] = useState<RecordInputErrors>({});
  const [failure, setFailure] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState(initial.merchantDomain.trim() !== '');
  const [rejections, setRejections] = useState(0);
  const correction = useRef<HTMLInputElement>(null);
  const [correctionOpened, setCorrectionOpened] = useState(0);

  // "Change" disappears when it is used; the cursor goes to the field it opened.
  useEffect(() => {
    if (correctionOpened > 0) correction.current?.focus();
  }, [correctionOpened]);

  // After a refused save, move to the first field that needs correcting.
  useEffect(() => {
    if (rejections > 0) {
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [rejections]);

  const messages = errorMessages(errors);
  const checked = validateRecordInput(input);
  const fields = !checked.ok
    ? undefined
    : saved === undefined
      ? checked.fields
      : fieldsForEdit(saved, input, checked.fields);
  const warnings = fields === undefined ? [] : recordWarnings(fields, records, today, saved?.id);
  const domain = previewMerchantDomain(input, saved);
  const site = domain === undefined ? undefined : merchantName(domain);
  // While the site is being corrected: what the address alone gives, as a hint of
  // what applies if the correction is left empty, and what the correction will be
  // saved as when that is not what was typed (a full link, "www.", capitals).
  const addressDomain = previewMerchantDomain({ ...input, merchantDomain: '' }, saved);
  const addressSite = addressDomain === undefined ? undefined : merchantName(addressDomain);
  const typedSite = input.merchantDomain.trim();
  const savedAs =
    site !== undefined && typedSite !== '' && typedSite !== site.name && typedSite !== site.stored
      ? site
      : undefined;

  function change(field: keyof RecordInput, value: string) {
    const next = { ...input, [field]: value };
    setInput(next);
    onInput?.(next);
    const together = CHECKED_TOGETHER[field];
    if (errors[field] !== undefined || (together !== undefined && errors[together] !== undefined)) {
      const rest = { ...errors };
      delete rest[field];
      if (together !== undefined) delete rest[together];
      setErrors(rest);
    }
  }

  function startCorrecting() {
    setCorrecting(true);
    setCorrectionOpened((count) => count + 1);
  }

  function stopCorrecting() {
    setCorrecting(false);
    change('merchantDomain', '');
  }

  function completeYear(field: 'startDate' | 'expiryDate') {
    const completed = completeDateYear(input[field]);
    if (completed !== input[field]) change(field, completed);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    // A second click while the first save is under way would add the code twice.
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setFailure(undefined);
    // Enter saves without the date field losing the focus, so a two-digit year
    // is completed here as well.
    const entered = {
      ...input,
      startDate: completeDateYear(input.startDate),
      expiryDate: completeDateYear(input.expiryDate),
    };
    if (entered.startDate !== input.startDate || entered.expiryDate !== input.expiryDate) {
      setInput(entered);
      onInput?.(entered);
    }
    const outcome = await onSubmit(entered);
    busy.current = false;
    setSaving(false);
    if (outcome.ok) return;
    if ('errors' in outcome) {
      setErrors(outcome.errors);
      if (outcome.errors.merchantDomain !== undefined) setCorrecting(true);
      setRejections((count) => count + 1);
    } else {
      setFailure(outcome.message);
    }
  }

  /** The attributes that tie an input to its label and its error sentence. */
  function control(field: keyof RecordInput) {
    const invalid = messages[field] !== undefined;
    return {
      id: `${id}-${field}`,
      name: field,
      value: input[field],
      'aria-invalid': invalid,
      'aria-describedby': invalid ? `${id}-${field}-error` : undefined,
    };
  }

  function field(
    name: keyof RecordInput,
    label: string,
    element: ReactNode,
    extra?: ReactNode,
    /** Shown at the end of the label's line. */
    aside?: ReactNode,
  ) {
    return (
      <div className="field">
        <div className="field__label">
          <label htmlFor={`${id}-${name}`}>{label}</label>
          {aside}
        </div>
        {element}
        {messages[name] !== undefined && (
          <p className="field__error" id={`${id}-${name}-error`}>
            {messages[name]}
          </p>
        )}
        {extra}
      </div>
    );
  }

  return (
    <form ref={form} className="record-form" noValidate onSubmit={(event) => void submit(event)}>
      {field(
        'promoCode',
        'Promo code',
        <input
          {...control('promoCode')}
          className="field__input field__input--code"
          type="text"
          required
          autoFocus={focusCode}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => change('promoCode', event.target.value)}
        />,
      )}

      <p className="record-form__optional muted">The rest is optional.</p>

      {field(
        'resourceUrl',
        'Website or link',
        <input
          {...control('resourceUrl')}
          className="field__input"
          type="text"
          inputMode="url"
          placeholder="example.org"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => change('resourceUrl', event.target.value)}
        />,
        correcting ? (
          <>
            {/* Takes the place of the "Site:" line, so the form does not grow by a whole field. */}
            <div className="field__correction">
              <label htmlFor={`${id}-merchantDomain`}>Site:</label>
              <input
                {...control('merchantDomain')}
                ref={correction}
                className="field__input"
                type="text"
                inputMode="url"
                placeholder={addressSite?.name ?? 'example.org'}
                title="The store this code is for, when the link leads somewhere else first"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(event) => change('merchantDomain', event.target.value)}
              />
              <button
                type="button"
                className="link"
                title="Use the site from the link"
                onClick={stopCorrecting}
              >
                Reset
              </button>
            </div>
            {messages.merchantDomain !== undefined && (
              <p className="field__error" id={`${id}-merchantDomain-error`}>
                {messages.merchantDomain}
              </p>
            )}
            {savedAs !== undefined && (
              <p className="field__site" aria-live="polite">
                Saved as <strong>{savedAs.name}</strong>
                {savedAs.stored !== undefined && <span className="muted"> ({savedAs.stored})</span>}
              </p>
            )}
          </>
        ) : (
          site !== undefined && (
            <p className="field__site" aria-live="polite">
              Site: <strong>{site.name}</strong>
              {site.stored !== undefined && <span className="muted"> ({site.stored})</span>}{' '}
              <button type="button" className="link" onClick={startCorrecting}>
                Change
              </button>
            </p>
          )
        ),
      )}

      <div className="record-form__dates">
        {field(
          'startDate',
          'Valid from',
          <input
            {...control('startDate')}
            className="field__input"
            type="text"
            inputMode="numeric"
            placeholder="DD.MM.YYYY"
            autoComplete="off"
            maxLength={10}
            onChange={(event) =>
              change('startDate', maskDateInput(input.startDate, event.target.value))
            }
            onBlur={() => completeYear('startDate')}
          />,
        )}
        {field(
          'expiryDate',
          'Expires',
          <input
            {...control('expiryDate')}
            className="field__input"
            type="text"
            inputMode="numeric"
            placeholder="DD.MM.YYYY"
            autoComplete="off"
            maxLength={10}
            onChange={(event) =>
              change('expiryDate', maskDateInput(input.expiryDate, event.target.value))
            }
            onBlur={() => completeYear('expiryDate')}
          />,
        )}
      </div>

      {field(
        'note',
        'Note',
        <textarea
          {...control('note')}
          className="field__input"
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(event) => change('note', event.target.value)}
        />,
        undefined,
        <span className="field__count muted">
          {input.note.length} of {NOTE_MAX_LENGTH} characters
        </span>,
      )}

      <div aria-live="polite">
        {fields !== undefined && warnings.length > 0 && (
          <ul className="record-form__warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warningMessage(warning, fields)}</li>
            ))}
          </ul>
        )}
      </div>

      {failure !== undefined && (
        <p className="problem" role="alert">
          {failure}
        </p>
      )}

      <div className="record-form__actions">
        <button className="button" type="submit" disabled={saving}>
          {submitLabel}
        </button>
        {secondary !== undefined && (
          <button className="button button--quiet" type="button" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )}
      </div>
    </form>
  );
}
