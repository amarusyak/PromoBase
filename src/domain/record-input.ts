import { formatDisplayDate, parseDisplayDate, type DateProblem } from './dates';
import { deriveMerchantDomain, type DomainProblem } from './derive-merchant-domain';
import {
  NOTE_MAX_LENGTH,
  PROMO_CODE_MAX_LENGTH,
  RESOURCE_URL_MAX_LENGTH,
  type PromoCodeRecord,
} from './record';
import { recordStatus } from './record-status';

/** What a person typed into the record form, exactly as typed. */
export interface RecordInput {
  promoCode: string;
  /** A full address or a bare site name. May be blank. */
  resourceUrl: string;
  /**
   * The user's correction of the merchant domain (D-017). Blank means "use the
   * one derived from resourceUrl", which is the normal case.
   */
  merchantDomain: string;
  /** DD.MM.YYYY or blank. */
  startDate: string;
  /** DD.MM.YYYY or blank. */
  expiryDate: string;
  note: string;
}

/** The checked, stored form of the fields a person can edit. Blank optional fields are absent. */
export type RecordFields = Pick<
  PromoCodeRecord,
  'promoCode' | 'resourceUrl' | 'merchantDomain' | 'startDate' | 'expiryDate' | 'note'
>;

/** A non-blank address always yields a specific reason, never 'empty'. */
type AddressProblem = Exclude<DomainProblem, 'empty'>;

/** One reason per field that needs correcting (PB-014). Fields without a problem are absent. */
export interface RecordInputErrors {
  promoCode?: 'required' | 'too-long';
  resourceUrl?: 'too-long' | AddressProblem;
  /** 'needs-address': a corrected domain was given, but there is no address to correct. */
  merchantDomain?: 'needs-address' | AddressProblem;
  startDate?: DateProblem;
  /** 'before-start': a real date, but earlier than the start date (PB-008). */
  expiryDate?: DateProblem | 'before-start';
  note?: 'too-long';
}

export type RecordInputResult =
  { ok: true; fields: RecordFields } | { ok: false; errors: RecordInputErrors };

function addressProblem(problem: DomainProblem): AddressProblem {
  return problem === 'empty' ? 'not-a-web-address' : problem;
}

/**
 * Checks the form and turns it into the stored form of each field: text is
 * trimmed, dates become YYYY-MM-DD and the merchant domain is derived
 * (PB-004, PB-005, PB-008). Every field is checked, so all problems are
 * reported at once.
 */
export function validateRecordInput(input: RecordInput): RecordInputResult {
  const errors: RecordInputErrors = {};
  const fields: RecordFields = { promoCode: input.promoCode.trim() };

  if (fields.promoCode === '') errors.promoCode = 'required';
  else if (fields.promoCode.length > PROMO_CODE_MAX_LENGTH) errors.promoCode = 'too-long';

  const resourceUrl = input.resourceUrl.trim();
  if (resourceUrl.length > RESOURCE_URL_MAX_LENGTH) {
    errors.resourceUrl = 'too-long';
  } else if (resourceUrl !== '') {
    const derived = deriveMerchantDomain(resourceUrl);
    if (derived.ok) {
      fields.resourceUrl = resourceUrl;
      fields.merchantDomain = derived.domain;
    } else {
      errors.resourceUrl = addressProblem(derived.problem);
    }
  }

  const correction = input.merchantDomain.trim();
  if (correction !== '') {
    if (resourceUrl === '') {
      errors.merchantDomain = 'needs-address';
    } else {
      const corrected = deriveMerchantDomain(correction);
      if (corrected.ok) fields.merchantDomain = corrected.domain;
      else errors.merchantDomain = addressProblem(corrected.problem);
    }
  }

  const startText = input.startDate.trim();
  if (startText !== '') {
    const start = parseDisplayDate(startText);
    if (start.ok) fields.startDate = start.iso;
    else errors.startDate = start.problem;
  }

  const expiryText = input.expiryDate.trim();
  if (expiryText !== '') {
    const expiry = parseDisplayDate(expiryText);
    if (expiry.ok) fields.expiryDate = expiry.iso;
    else errors.expiryDate = expiry.problem;
  }

  if (
    fields.startDate !== undefined &&
    fields.expiryDate !== undefined &&
    fields.startDate > fields.expiryDate
  ) {
    errors.expiryDate = 'before-start';
  }

  const note = input.note.trim();
  if (note.length > NOTE_MAX_LENGTH) errors.note = 'too-long';
  else if (note !== '') fields.note = note;

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, fields };
}

/** Things worth pointing out that do not stop a save (D-020). */
export type RecordWarning =
  /** Another saved record has the same code, ignoring case, for the same merchant. */
  | 'duplicate'
  /** The expiry date has already passed. */
  | 'already-expired';

/**
 * Warnings for fields that passed validation. When an existing record is being
 * edited, pass its id so it is not reported as a duplicate of itself.
 */
export function recordWarnings(
  fields: RecordFields,
  saved: readonly PromoCodeRecord[],
  today: string,
  editedId?: string,
): RecordWarning[] {
  const warnings: RecordWarning[] = [];
  const code = fields.promoCode.toLowerCase();
  const isDuplicate = saved.some(
    (record) =>
      record.id !== editedId &&
      record.promoCode.toLowerCase() === code &&
      record.merchantDomain === fields.merchantDomain,
  );
  if (isDuplicate) warnings.push('duplicate');
  if (recordStatus(fields, today) === 'expired') warnings.push('already-expired');
  return warnings;
}

/**
 * The form contents for editing a saved record (PB-010).
 *
 * The merchant domain is filled in only when the user corrected it, that is
 * when it differs from what the address gives and is a merchant domain in its
 * own right. In every other case it stays blank. What an edit then stores is
 * decided by fieldsForEdit, which keeps the saved domain until the user
 * changes the address or the correction.
 */
export function recordToInput(record: PromoCodeRecord): RecordInput {
  const resourceUrl = formAddress(record);
  return {
    promoCode: record.promoCode,
    resourceUrl,
    merchantDomain: correctedDomain(record.merchantDomain, resourceUrl) ?? '',
    startDate: record.startDate === undefined ? '' : formatDisplayDate(record.startDate),
    expiryDate: record.expiryDate === undefined ? '' : formatDisplayDate(record.expiryDate),
    note: record.note ?? '',
  };
}

/**
 * The address the form opens with. A record with a merchant domain but no
 * address is never written by the record store, yet it can be read, and a
 * correction without an address is not a form that passes the checks. Its
 * domain is itself a valid address, so the form opens with that. A domain that
 * cannot name a merchant gives a blank address. Either way the record keeps
 * what it has until the user changes the form, see fieldsForEdit.
 */
function formAddress(record: PromoCodeRecord): string {
  const address = record.resourceUrl ?? '';
  if (address.trim() !== '') return address;
  const saved = record.merchantDomain;
  return saved !== undefined && deriveMerchantDomain(saved).ok ? saved : '';
}

function correctedDomain(saved: string | undefined, address: string): string | undefined {
  if (saved === undefined) return undefined;
  const fromAddress = deriveMerchantDomain(address);
  if (fromAddress.ok && fromAddress.domain === saved) return undefined;
  const onItsOwn = deriveMerchantDomain(saved);
  return onItsOwn.ok && onItsOwn.domain === saved ? saved : undefined;
}

/**
 * What an edit of `saved` stores. `typed` is the form as submitted and
 * `checked` is the outcome of validateRecordInput for it.
 *
 * While the form still shows the address and the merchant domain the record
 * opened with, both are kept exactly as saved instead of being derived again.
 * An edit of the code, the dates or the note therefore never changes which
 * merchant a record belongs to, or drops its reminders, even when the saved
 * domain is not what the current Public Suffix List would give (D-070, D-078).
 * Once the user changes either of the two, both come from the form.
 *
 * The comparison is with the record as stored at the moment of saving. A form
 * opened before another tab changed the record counts as changed.
 */
export function fieldsForEdit(
  saved: PromoCodeRecord,
  typed: RecordInput,
  checked: RecordFields,
): RecordFields {
  const opened = recordToInput(saved);
  const merchantChanged =
    typed.resourceUrl.trim() !== opened.resourceUrl.trim() ||
    typed.merchantDomain.trim() !== opened.merchantDomain.trim();
  if (merchantChanged) return checked;

  return {
    promoCode: checked.promoCode,
    ...(saved.resourceUrl === undefined ? {} : { resourceUrl: saved.resourceUrl }),
    ...(saved.merchantDomain === undefined ? {} : { merchantDomain: saved.merchantDomain }),
    ...(checked.startDate === undefined ? {} : { startDate: checked.startDate }),
    ...(checked.expiryDate === undefined ? {} : { expiryDate: checked.expiryDate }),
    ...(checked.note === undefined ? {} : { note: checked.note }),
  };
}
