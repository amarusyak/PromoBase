import { RECORD_LIMIT, type PromoCodeRecord } from '../domain/record';
import {
  fieldsForEdit,
  validateRecordInput,
  type RecordInput,
  type RecordInputErrors,
} from '../domain/record-input';
import {
  parseStoredState,
  SCHEMA_VERSION,
  STATE_KEY,
  type StoredState,
} from '../domain/stored-state';
import type { KeyValueStore } from '../platform/key-value-store';
import type { Lock } from '../platform/lock';
import { loadStoredState, type LoadResult } from './load-state';

/**
 * The only place that changes saved records (D-041). Every change reads the
 * stored state, works out the new one and writes it back while holding the
 * state lock (D-053), so changes made at the same moment in the popup, the
 * library tab or the service worker cannot overwrite each other.
 *
 * Nothing here throws: each function resolves to a result that says what
 * happened, and a result with `ok: false` always means nothing was changed
 * (PB-014).
 */

/** Name of the lock every change to stored state runs under. */
export const STATE_LOCK = 'promobase.state';

/** What the record store needs from outside, so tests can supply their own. */
export interface RecordStoreDeps {
  store: KeyValueStore;
  lock: Lock;
  /** The current moment. */
  now: () => Date;
  /** A new id that no other record has. */
  newId: () => string;
}

/** A load result that the store must not write over (D-042). */
export type UnreadableState = Exclude<LoadResult, { status: 'empty' | 'ok' }>;

/** Failures that any change can run into. */
export type StoreFailure =
  /** The stored data cannot be read, so it was left exactly as it is. */
  | { ok: false; problem: 'unreadable'; cause: UnreadableState }
  /** Storage did not accept the change. The previously saved data is still there. */
  | { ok: false; problem: 'write-failed'; reason: string };

export type InvalidInput = { ok: false; problem: 'invalid'; errors: RecordInputErrors };

/** No record has this id, for example because it was deleted in another tab. */
export type NotFound = { ok: false; problem: 'not-found' };

/** RECORD_LIMIT records are saved already (PB-003). */
export type LimitReached = { ok: false; problem: 'limit-reached' };

export type Created = { ok: true; record: PromoCodeRecord };

/** `previous` is the record as it was, so the caller can see what the edit changed. */
export type Updated = { ok: true; record: PromoCodeRecord; previous: PromoCodeRecord };

/** `record` is the record that was removed. */
export type Deleted = { ok: true; record: PromoCodeRecord };

export type CreateResult = Created | InvalidInput | LimitReached | StoreFailure;
export type UpdateResult = Updated | InvalidInput | NotFound | StoreFailure;
export type DeleteResult = Deleted | NotFound | StoreFailure;

function writeFailed(reason: string): StoreFailure {
  return { ok: false, problem: 'write-failed', reason };
}

/**
 * Applies one change to the list of records under the state lock.
 *
 * `change` gets the records as stored and returns either the new list with the
 * result to report, or a failure, in which case nothing is written.
 */
async function changeRecords<Done extends { ok: true }, Refused extends { ok: false }>(
  deps: Pick<RecordStoreDeps, 'store' | 'lock'>,
  change: (
    records: readonly PromoCodeRecord[],
  ) => { records: PromoCodeRecord[]; done: Done } | Refused,
): Promise<Done | Refused | StoreFailure> {
  try {
    return await deps.lock<Done | Refused | StoreFailure>(async () => {
      const loaded = await loadStoredState(deps.store);
      if (loaded.status !== 'ok' && loaded.status !== 'empty') {
        return { ok: false, problem: 'unreadable', cause: loaded };
      }

      const step = change(loaded.status === 'ok' ? loaded.state.records : []);
      if (!('done' in step)) return step;

      // Last line of defence for D-042: never store something this build would
      // then report as unreadable, whatever went wrong in working it out.
      const next: StoredState = { schemaVersion: SCHEMA_VERSION, records: step.records };
      const check = parseStoredState(next);
      if (check.status !== 'ok') {
        const detail = check.status === 'corrupt' ? check.reason : check.status;
        return writeFailed(`the change would have stored unreadable data: ${detail}`);
      }

      await deps.store.set(STATE_KEY, next);
      return step.done;
    });
  } catch (error) {
    return writeFailed(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Saves a new record (PB-004). Reminders start switched off; turning them on
 * is a separate step the user is offered after saving (D-064).
 */
export async function createRecord(
  deps: RecordStoreDeps,
  input: RecordInput,
): Promise<CreateResult> {
  const checked = validateRecordInput(input);
  if (!checked.ok) return { ok: false, problem: 'invalid', errors: checked.errors };

  return changeRecords<Created, LimitReached>(deps, (records) => {
    if (records.length >= RECORD_LIMIT) return { ok: false, problem: 'limit-reached' };
    const timestamp = deps.now().toISOString();
    const record: PromoCodeRecord = {
      id: deps.newId(),
      ...checked.fields,
      notify: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return { records: [...records, record], done: { ok: true, record } };
  });
}

/**
 * Replaces the editable fields of a saved record (PB-010). Its id, creation
 * time and place in the stored list stay the same. Allowed at the record limit.
 *
 * The address and the merchant domain are replaced only when the user changed
 * one of them on the form; otherwise both stay exactly as saved (fieldsForEdit).
 *
 * Reminders stay on only while the merchant domain stays the same: the user
 * agreed to reminders on that site, not on whichever site the record points to
 * after an edit, so a changed or removed domain switches them off (PB-004).
 */
export async function updateRecord(
  deps: RecordStoreDeps,
  id: string,
  input: RecordInput,
): Promise<UpdateResult> {
  const checked = validateRecordInput(input);
  if (!checked.ok) return { ok: false, problem: 'invalid', errors: checked.errors };

  return changeRecords<Updated, NotFound>(deps, (records) => {
    const previous = records.find((record) => record.id === id);
    if (previous === undefined) return { ok: false, problem: 'not-found' };
    const fields = fieldsForEdit(previous, input, checked.fields);
    const record: PromoCodeRecord = {
      id: previous.id,
      ...fields,
      notify: previous.notify && fields.merchantDomain === previous.merchantDomain,
      createdAt: previous.createdAt,
      updatedAt: deps.now().toISOString(),
    };
    return {
      records: records.map((existing) => (existing === previous ? record : existing)),
      done: { ok: true, record, previous },
    };
  });
}

/** Removes a saved record for good (PB-011). Asking the user first is the caller's job. */
export async function deleteRecord(
  deps: Pick<RecordStoreDeps, 'store' | 'lock'>,
  id: string,
): Promise<DeleteResult> {
  return changeRecords<Deleted, NotFound>(deps, (records) => {
    const record = records.find((existing) => existing.id === id);
    if (record === undefined) return { ok: false, problem: 'not-found' };
    return {
      records: records.filter((existing) => existing !== record),
      done: { ok: true, record },
    };
  });
}
