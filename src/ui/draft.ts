import type { RecordInput } from '../domain/record-input';

/** Session storage key for the popup form's unsaved contents. */
export const DRAFT_KEY = 'promobase.draft';

export const EMPTY_INPUT: RecordInput = {
  promoCode: '',
  resourceUrl: '',
  merchantDomain: '',
  startDate: '',
  expiryDate: '',
  note: '',
};

const FIELDS = Object.keys(EMPTY_INPUT) as (keyof RecordInput)[];

/** True when nothing has been typed into any field. */
export function isBlankInput(input: RecordInput): boolean {
  return FIELDS.every((field) => input[field].trim() === '');
}

/**
 * Reads a stored draft. Anything that is not a complete set of text fields is
 * ignored, so a draft from another build can never break the form.
 */
export function parseDraft(raw: unknown): RecordInput | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const draft = { ...EMPTY_INPUT };
  for (const field of FIELDS) {
    const value = source[field];
    if (typeof value !== 'string') return undefined;
    draft[field] = value;
  }
  return isBlankInput(draft) ? undefined : draft;
}
