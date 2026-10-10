import type { UnreadableState } from '../data/record-store';
import { MAX_YEAR, MIN_YEAR } from '../domain/dates';
import { readableDomain } from '../domain/readable-domain';
import {
  NOTE_MAX_LENGTH,
  PROMO_CODE_MAX_LENGTH,
  RECORD_LIMIT,
  RESOURCE_URL_MAX_LENGTH,
} from '../domain/record';
import type { RecordFields, RecordInputErrors, RecordWarning } from '../domain/record-input';

/**
 * Every sentence the interface shows for a problem. Each one says what is
 * wrong and what to do about it (PB-014). The maps are keyed by the reason
 * codes of the logic, so a new code without a sentence does not compile.
 */

type Messages<Field extends keyof RecordInputErrors> = Record<
  NonNullable<RecordInputErrors[Field]>,
  string
>;

const ADDRESS: Messages<'resourceUrl'> = {
  'too-long': `An address can be up to ${RESOURCE_URL_MAX_LENGTH} characters. Use a shorter link or the site name alone.`,
  'not-a-web-address':
    'This is not a website address. Enter a link or a site name such as example.org.',
  'unsupported-scheme':
    'Only website addresses work here. Enter one that starts with http or https, or the site name alone.',
  'has-user-part': 'Remove everything up to and including the @. Enter the site address only.',
  'ip-address': 'Enter the name of the site, not a numeric address.',
  'local-name': 'Enter the full site name, with its ending, such as example.org.',
  'public-suffix': 'This ending is shared by many sites. Add the name of the site in front of it.',
};

const FIELD_MESSAGES: { [Field in keyof RecordInputErrors]-?: Messages<Field> } = {
  promoCode: {
    required: 'Enter the promo code.',
    'too-long': `A code can be up to ${PROMO_CODE_MAX_LENGTH} characters.`,
  },
  resourceUrl: ADDRESS,
  merchantDomain: {
    ...ADDRESS,
    'needs-address': 'Enter the website or link first.',
  },
  startDate: dateMessages(),
  expiryDate: {
    ...dateMessages(),
    'before-start': 'The expiry date is earlier than the start date. Change one of the two.',
  },
  note: {
    'too-long': `A note can be up to ${NOTE_MAX_LENGTH} characters.`,
  },
};

function dateMessages(): Messages<'startDate'> {
  return {
    format: 'Write the date as DD.MM.YYYY, for example 31.12.2026.',
    'not-a-date': 'This day does not exist. Check the day and the month.',
    'out-of-range': `Enter a year from ${MIN_YEAR} to ${MAX_YEAR}.`,
  };
}

/** One sentence per field that needs correcting. */
export type FieldMessages = Partial<Record<keyof RecordInputErrors, string>>;

/** The sentences for the problems validation reported. */
export function errorMessages(errors: RecordInputErrors): FieldMessages {
  const shown: FieldMessages = {};
  if (errors.promoCode !== undefined) {
    shown.promoCode = FIELD_MESSAGES.promoCode[errors.promoCode];
  }
  if (errors.resourceUrl !== undefined) {
    shown.resourceUrl = FIELD_MESSAGES.resourceUrl[errors.resourceUrl];
  }
  if (errors.merchantDomain !== undefined) {
    shown.merchantDomain = FIELD_MESSAGES.merchantDomain[errors.merchantDomain];
  }
  if (errors.startDate !== undefined) {
    shown.startDate = FIELD_MESSAGES.startDate[errors.startDate];
  }
  if (errors.expiryDate !== undefined) {
    shown.expiryDate = FIELD_MESSAGES.expiryDate[errors.expiryDate];
  }
  if (errors.note !== undefined) shown.note = FIELD_MESSAGES.note[errors.note];
  return shown;
}

/** The fields in the order they appear on the form, for finding the first one to correct. */
export const FIELD_ORDER = [
  'promoCode',
  'resourceUrl',
  'merchantDomain',
  'startDate',
  'expiryDate',
  'note',
] as const satisfies readonly (keyof RecordInputErrors)[];

/** The sentence for a warning that does not stop a save (D-020). */
export function warningMessage(warning: RecordWarning, fields: RecordFields): string {
  switch (warning) {
    case 'duplicate':
      return fields.merchantDomain === undefined
        ? 'You already saved this code without a site. Saving adds it a second time.'
        : `You already saved this code for ${readableDomain(fields.merchantDomain)}. Saving adds it a second time.`;
    case 'already-expired':
      return 'This expiry date has passed. The code will be saved as expired.';
  }
}

/** PB-003: why a new code cannot be added and what to do next. */
export const LIMIT_REACHED = `You have saved ${RECORD_LIMIT} codes, which is the most PromoBase keeps. Delete one you no longer need to add another.`;

/** Stored data that cannot be read or written over (D-042). */
export function unreadableMessage(cause: UnreadableState): string {
  switch (cause.status) {
    case 'unsupported-version':
      return (
        'Your saved codes were written by a newer version of PromoBase. ' +
        'Update the extension to see them. Nothing has been changed.'
      );
    case 'corrupt':
      return 'PromoBase could not read your saved codes. Nothing has been changed.';
    case 'unavailable':
      return 'Chrome storage is not responding. Close PromoBase and open it again.';
  }
}

/** What to tell the user when a save or a delete did not go through. */
export type ChangeFailure =
  | { problem: 'limit-reached' }
  | { problem: 'not-found' }
  | { problem: 'unreadable'; cause: UnreadableState }
  | { problem: 'write-failed'; reason: string };

export function changeFailureMessage(failure: ChangeFailure, action: 'save' | 'delete'): string {
  switch (failure.problem) {
    case 'limit-reached':
      return LIMIT_REACHED;
    case 'not-found':
      return action === 'save'
        ? 'This code was deleted in another window, so the changes could not be saved.'
        : 'This code was already deleted in another window.';
    case 'unreadable':
      return unreadableMessage(failure.cause);
    case 'write-failed':
      return action === 'save'
        ? 'Chrome could not save the code. Nothing was changed, and what you entered is still here. Try again.'
        : 'Chrome could not delete the code. Nothing was changed. Try again.';
  }
}
