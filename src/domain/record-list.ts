import { readableDomain } from './readable-domain';
import type { PromoCodeRecord } from './record';
import { recordStatus, type RecordStatus } from './record-status';

const STATUS_ORDER: Record<RecordStatus, number> = { active: 0, upcoming: 1, expired: 2 };

/**
 * List order (PB-009): active records first, upcoming next, expired last, and
 * the newest first inside each group. Returns a new list.
 *
 * Two records created in the same millisecond are ordered by id, so the order
 * never depends on how the input happened to be arranged.
 */
export function sortRecords(records: readonly PromoCodeRecord[], today: string): PromoCodeRecord[] {
  return [...records].sort((a, b) => {
    const byStatus = STATUS_ORDER[recordStatus(a, today)] - STATUS_ORDER[recordStatus(b, today)];
    if (byStatus !== 0) return byStatus;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * Records whose code, merchant domain or note contains the query, ignoring
 * case (PB-009). An international merchant name is found by its readable
 * spelling as well as by its stored one. A blank query matches everything.
 * Order is kept.
 */
export function searchRecords(
  records: readonly PromoCodeRecord[],
  query: string,
): PromoCodeRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...records];
  return records.filter((record) => {
    const domain = record.merchantDomain;
    const readable = domain === undefined ? undefined : readableDomain(domain);
    return [record.promoCode, domain, readable, record.note].some(
      (text) => text !== undefined && text.toLowerCase().includes(needle),
    );
  });
}
