import type { PromoCodeRecord } from './record';

/** Where a record stands on a given day (PB-008). */
export type RecordStatus = 'active' | 'upcoming' | 'expired';

/**
 * A record with no dates is active indefinitely. The expiry day itself still
 * counts as active; the record is expired from the next day on. A record whose
 * start date is still ahead is upcoming.
 *
 * `today` is the user's local calendar day as YYYY-MM-DD, see localToday.
 */
export function recordStatus(
  record: Pick<PromoCodeRecord, 'startDate' | 'expiryDate'>,
  today: string,
): RecordStatus {
  if (record.expiryDate !== undefined && record.expiryDate < today) return 'expired';
  if (record.startDate !== undefined && record.startDate > today) return 'upcoming';
  return 'active';
}
