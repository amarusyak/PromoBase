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
  /** The address as the user entered it, trimmed. Always an http(s) address or a bare site name. */
  resourceUrl?: string;
  /**
   * Registrable domain, for example "dropbox.com": derived from resourceUrl, or
   * the user's own correction of that (D-017). The record store never saves one
   * without a resourceUrl, but reading does not insist on that.
   */
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

/** PB-004: maximum note length, counted as String.length, the way a text field's maxlength counts. */
export const NOTE_MAX_LENGTH = 140;

/** D-020: maximum promo code length. Real codes are far shorter; this only stops pasted essays. */
export const PROMO_CODE_MAX_LENGTH = 100;

/** D-020: maximum address length. Long enough for links that carry tracking parameters. */
export const RESOURCE_URL_MAX_LENGTH = 2000;
