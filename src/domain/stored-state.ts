import type { PromoCodeRecord } from './record';

/**
 * Version of the persisted data layout (D-023). Increase it whenever the shape
 * of StoredState or PromoCodeRecord changes, and add a migration from the
 * previous version in parseStoredState.
 */
export const SCHEMA_VERSION = 1;

/** The single chrome.storage.local key that holds all PromoBase data. */
export const STATE_KEY = 'promobase.state';

/** Everything PromoBase persists, written and read as one value. */
export interface StoredState {
  schemaVersion: typeof SCHEMA_VERSION;
  records: PromoCodeRecord[];
}

export type ParseResult =
  /** Nothing has been saved yet. */
  | { status: 'empty' }
  | { status: 'ok'; state: StoredState }
  /** Written by a newer build. Must not be modified or overwritten. */
  | { status: 'unsupported-version'; found: number }
  /** Not a shape this build can read. Must not be modified or overwritten. */
  | { status: 'corrupt'; reason: string };

const REQUIRED_STRING_FIELDS = ['id', 'promoCode', 'createdAt', 'updatedAt'] as const;
const OPTIONAL_STRING_FIELDS = [
  'resourceUrl',
  'merchantDomain',
  'startDate',
  'expiryDate',
  'note',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks field presence and types, plus the rules that reminder logic depends
 * on (PRD 8.1): a merchant domain is either absent or non-blank, and a record
 * can only ask for reminders when it has one. Whether the domain is in
 * canonical form is not checked here yet. Other business rules, such as date
 * formats and note length, are enforced when a record is written.
 */
function describeRecordProblem(value: unknown): string | undefined {
  if (!isPlainObject(value)) return 'is not an object';
  for (const field of REQUIRED_STRING_FIELDS) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'string' || fieldValue === '') {
      return `has no valid "${field}"`;
    }
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (field in value && typeof value[field] !== 'string') {
      return `has a non-text "${field}"`;
    }
  }
  if (typeof value.notify !== 'boolean') return 'has no valid "notify"';
  // The loop above leaves merchantDomain either absent or a string.
  const merchantDomain = value.merchantDomain as string | undefined;
  if (merchantDomain?.trim() === '') return 'has a blank "merchantDomain"';
  if (value.notify && merchantDomain === undefined) {
    return 'has "notify" on without a "merchantDomain"';
  }
  return undefined;
}

/**
 * Interprets the raw value read from storage under STATE_KEY.
 *
 * Never throws and never repairs: anything unreadable is reported so the
 * caller can leave the stored data untouched (PB-014).
 */
export function parseStoredState(raw: unknown): ParseResult {
  if (raw === undefined) return { status: 'empty' };
  if (!isPlainObject(raw)) return { status: 'corrupt', reason: 'stored value is not an object' };

  const { schemaVersion, records } = raw;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { status: 'corrupt', reason: 'schemaVersion is missing or invalid' };
  }
  if (schemaVersion > SCHEMA_VERSION) {
    return { status: 'unsupported-version', found: schemaVersion };
  }

  if (!Array.isArray(records)) return { status: 'corrupt', reason: 'records is not a list' };

  const seenIds = new Set<string>();
  for (const [index, record] of records.entries()) {
    const problem = describeRecordProblem(record);
    if (problem !== undefined) {
      return { status: 'corrupt', reason: `record ${index} ${problem}` };
    }
    const { id } = record as PromoCodeRecord;
    if (seenIds.has(id)) {
      return { status: 'corrupt', reason: `record ${index} repeats an earlier id` };
    }
    seenIds.add(id);
  }

  return {
    status: 'ok',
    state: { schemaVersion: SCHEMA_VERSION, records: records as PromoCodeRecord[] },
  };
}
