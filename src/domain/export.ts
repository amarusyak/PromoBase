import { localToday } from './dates';
import type { PromoCodeRecord } from './record';
import { SCHEMA_VERSION } from './stored-state';

/**
 * The JSON export of the saved codes (D-027): a copy a person keeps, reads,
 * or hands to a later import. Fields come in a fixed order, since storage
 * returns them in whatever order it likes (D-079).
 */

/** Names the file format, so a later import can tell a PromoBase export from any other JSON. */
export const EXPORT_FORMAT = 'promobase-export';

/** The fields of a record, in the order the export writes them. Anything else is left out. */
const FIELD_ORDER = [
  'id',
  'promoCode',
  'resourceUrl',
  'merchantDomain',
  'startDate',
  'expiryDate',
  'note',
  'notify',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof PromoCodeRecord)[];

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  /** The stored layout the records follow (D-023). */
  schemaVersion: typeof SCHEMA_VERSION;
  /** ISO 8601 UTC. */
  exportedAt: string;
  records: Partial<PromoCodeRecord>[];
}

/** The record's own fields in export order; keys this build does not know are left out. */
export function orderedRecord(record: PromoCodeRecord): Partial<PromoCodeRecord> {
  const out: Partial<Record<keyof PromoCodeRecord, unknown>> = {};
  for (const field of FIELD_ORDER) {
    if (record[field] !== undefined) out[field] = record[field];
  }
  return out as Partial<PromoCodeRecord>;
}

/** The records in the order they are stored, which is the order they were added. */
export function exportDocument(records: readonly PromoCodeRecord[], now: Date): ExportDocument {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    records: records.map(orderedRecord),
  };
}

/** Indented, so the file can be read by a person; ends with a line break. */
export function exportText(document: ExportDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * For example promobase-codes-2026-11-09-17-36.json: the person's own day and
 * time, to the minute, so exports made on one day keep apart. Hyphens, since
 * macOS and Windows do not allow colons in file names.
 */
export function exportFileName(now: Date): string {
  const time = [now.getHours(), now.getMinutes()].map((n) => String(n).padStart(2, '0'));
  return `promobase-codes-${localToday(now)}-${time.join('-')}.json`;
}

/**
 * A copy of the saved data exactly as stored, for when PromoBase cannot read
 * it (D-042, D-124). Nothing is checked, reordered or left out: it is the
 * person's own data, kept safe while the problem is fixed.
 */
export function savedDataText(storedValue: unknown): string {
  return `${JSON.stringify(storedValue, null, 2)}\n`;
}

/** promobase-saved-data-YYYY-MM-DD-HH-MM.json, in local time, like the export's name. */
export function savedDataFileName(now: Date): string {
  return exportFileName(now).replace('promobase-codes-', 'promobase-saved-data-');
}
