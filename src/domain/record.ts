/**
 * A saved promo code. Field rules are defined in PRD section 8.1.
 *
 * Dates are local calendar dates, not instants (PRD 8.2). Timestamps are UTC.
 * Optional fields are omitted when empty, never stored as undefined or "".
 */
export interface PromoCodeRecord {
  /** UUID generated on creation. */
  id: string;
  /** Trimmed, non-empty. Case is preserved for display and copy. */
  promoCode: string;
  /** The URL as the user entered it. */
  resourceUrl?: string;
  /** Registrable domain derived from resourceUrl, for example "dropbox.com". */
  merchantDomain?: string;
  /** YYYY-MM-DD. */
  startDate?: string;
  /** YYYY-MM-DD, valid through the end of that local day. */
  expiryDate?: string;
  note?: string;
  /** Must be false when merchantDomain is absent. */
  notify: boolean;
  /** ISO 8601 UTC timestamp. */
  createdAt: string;
  /** ISO 8601 UTC timestamp, updated on every successful edit. */
  updatedAt: string;
}

/** PB-003: guest users can store up to this many records. */
export const RECORD_LIMIT = 100;

/** PB-004: maximum note length in characters. */
export const NOTE_MAX_LENGTH = 140;
