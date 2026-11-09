import { EXPORT_FORMAT, orderedRecord } from './export';
import { RECORD_LIMIT, type PromoCodeRecord } from './record';
import { parseStoredState, SCHEMA_VERSION } from './stored-state';

/**
 * Reading a PromoBase export back in (D-027, owner's trial of E1). An import
 * only ever adds: a saved code is never changed or removed, and a code whose
 * id is already saved is skipped and reported.
 */

/**
 * The largest file an import reads (review of PR #8). A real export is far
 * smaller: 100 codes, each with at most a 2,000-character address, a
 * 140-character note and a 100-character code, come to roughly 300 kB. The
 * size is known without reading the file, so anything larger is refused
 * before it is loaded into memory.
 */
export const IMPORT_MAX_BYTES = 1024 * 1024;

/** Whether a file of this many bytes is refused unread. */
export function importTooLarge(bytes: number): boolean {
  return bytes > IMPORT_MAX_BYTES;
}

export type ImportProblem =
  /** Larger than any export can be; not read at all. */
  | 'too-large'
  /** Not JSON at all. */
  | 'not-json'
  /** JSON, but not a PromoBase export. */
  | 'not-an-export'
  /** Made by a newer PromoBase than this one. */
  | 'newer-version'
  /** A PromoBase export with a record this build cannot read. */
  | 'invalid-record';

export type ParsedImport =
  | { ok: true; records: PromoCodeRecord[] }
  | { ok: false; problem: ImportProblem; /** 1-based, for invalid-record. */ record?: number };

/**
 * Checks a whole file before anything is saved. Every record must pass the
 * same check as saved data (stored-state.ts), so a file is taken whole or not
 * at all. Keys this build does not know are dropped.
 */
export function parseImport(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not-json' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, problem: 'not-an-export' };
  }
  const { format, schemaVersion, records } = raw as Record<string, unknown>;
  if (format !== EXPORT_FORMAT || !Array.isArray(records)) {
    return { ok: false, problem: 'not-an-export' };
  }
  if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) {
    return { ok: false, problem: 'newer-version' };
  }
  const parsed = parseStoredState({ schemaVersion, records });
  if (parsed.status === 'unsupported-version') return { ok: false, problem: 'newer-version' };
  if (parsed.status !== 'ok') {
    const index =
      parsed.status === 'corrupt' ? /^record (\d+)/.exec(parsed.reason)?.[1] : undefined;
    return index === undefined
      ? { ok: false, problem: 'not-an-export' }
      : { ok: false, problem: 'invalid-record', record: Number(index) + 1 };
  }
  return {
    ok: true,
    records: parsed.state.records.map((r) => orderedRecord(r) as PromoCodeRecord),
  };
}

/** What an import does, worked out before anything is saved. */
export interface ImportPlan {
  /** The records as they will be stored, in file order. */
  added: PromoCodeRecord[];
  /** Already saved under the same id: left as saved. */
  sameId: PromoCodeRecord[];
  /** Did not fit under RECORD_LIMIT (PB-003). */
  overLimit: PromoCodeRecord[];
  /** Added, but the same code for the same site is saved already (D-077): worth a look. */
  lookAlike: PromoCodeRecord[];
}

const sameCode = (a: PromoCodeRecord, b: PromoCodeRecord) =>
  a.promoCode.toLowerCase() === b.promoCode.toLowerCase() && a.merchantDomain === b.merchantDomain;

/**
 * Merges imported records into the saved ones, which stay exactly as they are.
 *
 * Reminders are switched per site (D-100): a site that already has saved codes
 * keeps its switch, and an imported code for it follows that switch. For a
 * site new to this library, the file decides: on if any of its codes in the
 * file has reminders on. Site access is not part of an export; such a site
 * waits for Chrome's permission until the person allows it.
 */
export function planImport(
  saved: readonly PromoCodeRecord[],
  incoming: readonly PromoCodeRecord[],
): ImportPlan {
  const savedIds = new Set(saved.map((record) => record.id));
  const savedSites = new Map<string, boolean>();
  for (const record of saved) {
    if (record.merchantDomain !== undefined) {
      savedSites.set(
        record.merchantDomain,
        (savedSites.get(record.merchantDomain) ?? false) || record.notify,
      );
    }
  }
  const fileSites = new Map<string, boolean>();
  for (const record of incoming) {
    if (record.merchantDomain !== undefined) {
      fileSites.set(
        record.merchantDomain,
        (fileSites.get(record.merchantDomain) ?? false) || record.notify,
      );
    }
  }

  const plan: ImportPlan = { added: [], sameId: [], overLimit: [], lookAlike: [] };
  let room = RECORD_LIMIT - saved.length;
  for (const record of incoming) {
    if (savedIds.has(record.id)) {
      plan.sameId.push(record);
      continue;
    }
    if (room <= 0) {
      plan.overLimit.push(record);
      continue;
    }
    const site = record.merchantDomain;
    const notify =
      site === undefined ? false : (savedSites.get(site) ?? fileSites.get(site) ?? false);
    const added = { ...record, notify };
    plan.added.push(added);
    if (saved.some((other) => sameCode(other, added))) plan.lookAlike.push(added);
    room -= 1;
  }
  return plan;
}
