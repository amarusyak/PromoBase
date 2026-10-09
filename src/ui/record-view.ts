import { formatDisplayDate } from '../domain/dates';
import { readableDomain } from '../domain/readable-domain';
import type { PromoCodeRecord } from '../domain/record';
import { sortRecords } from '../domain/record-list';
import { recordStatus, type RecordStatus } from '../domain/record-status';

/** Status as words, so it never depends on colour alone (PRD 7.2). */
export const STATUS_LABEL: Record<RecordStatus, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  expired: 'Expired',
};

/** How a merchant domain is shown. */
export interface MerchantName {
  /** The spelling a person recognises, for example "münchen.de". */
  name: string;
  /**
   * The stored spelling, present only when it differs. Shown next to the name
   * so that a look-alike name cannot pass for another site.
   */
  stored?: string;
}

export function merchantName(domain: string): MerchantName {
  const name = readableDomain(domain);
  return name === domain ? { name } : { name, stored: domain };
}

/** What one row of the list shows (PB-009). */
export interface RecordView {
  id: string;
  code: string;
  /** Absent when the record has no merchant domain. */
  merchant?: MerchantName;
  status: RecordStatus;
  statusLabel: string;
  /** One short line about the dates, absent when the record has none worth mentioning. */
  dates?: string;
  note?: string;
}

function describeDates(record: PromoCodeRecord, status: RecordStatus, today: string) {
  const { startDate, expiryDate } = record;
  if (status === 'expired' && expiryDate !== undefined) {
    return `Expired ${formatDisplayDate(expiryDate)}`;
  }
  const expires =
    expiryDate === undefined
      ? undefined
      : expiryDate === today
        ? 'Expires today'
        : `Expires ${formatDisplayDate(expiryDate)}`;
  if (status === 'upcoming' && startDate !== undefined) {
    const starts = `Starts ${formatDisplayDate(startDate)}`;
    return expires === undefined ? starts : `${starts}, ${expires.toLowerCase()}`;
  }
  return expires;
}

export function viewRecord(record: PromoCodeRecord, today: string): RecordView {
  const status = recordStatus(record, today);
  const dates = describeDates(record, status, today);
  return {
    id: record.id,
    code: record.promoCode,
    ...(record.merchantDomain === undefined
      ? {}
      : { merchant: merchantName(record.merchantDomain) }),
    status,
    statusLabel: STATUS_LABEL[status],
    ...(dates === undefined ? {} : { dates }),
    ...(record.note === undefined || record.note.trim() === '' ? {} : { note: record.note }),
  };
}

export interface RecordGroup {
  status: RecordStatus;
  label: string;
  rows: RecordView[];
}

/**
 * The list as shown: active codes, then upcoming, then expired, newest first
 * in each (PB-009). Groups without records are left out.
 */
export function groupRecords(records: readonly PromoCodeRecord[], today: string): RecordGroup[] {
  const groups: RecordGroup[] = [];
  for (const record of sortRecords(records, today)) {
    const row = viewRecord(record, today);
    const last = groups.at(-1);
    if (last?.status === row.status) last.rows.push(row);
    else groups.push({ status: row.status, label: STATUS_LABEL[row.status], rows: [row] });
  }
  return groups;
}
