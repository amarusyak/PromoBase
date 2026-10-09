/**
 * Calendar dates (PRD 8.2). A date is a day on the calendar, not an instant:
 * it is typed and shown as DD.MM.YYYY and stored as YYYY-MM-DD, which sorts
 * and compares correctly as plain text.
 */

/** Why a typed date was not accepted. */
export type DateProblem =
  /** Not written as DD.MM.YYYY. */
  | 'format'
  /** Written correctly, but no such day exists, for example 31.02.2026. */
  | 'not-a-date'
  /** A real day outside MIN_YEAR to MAX_YEAR, which is almost always a typing slip. */
  | 'out-of-range';

export type DateResult = { ok: true; iso: string } | { ok: false; problem: DateProblem };

/** The years a typed date may fall in, both included. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

const DISPLAY_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isCalendarDay(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/**
 * Reads a date typed as DD.MM.YYYY (D-021). Strict on purpose: two digits, a
 * dot, two digits, a dot, four digits. Surrounding whitespace is ignored.
 */
export function parseDisplayDate(text: string): DateResult {
  const match = DISPLAY_DATE.exec(text.trim());
  if (match === null) return { ok: false, problem: 'format' };
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isCalendarDay(year, month, day)) return { ok: false, problem: 'not-a-date' };
  if (year < MIN_YEAR || year > MAX_YEAR) return { ok: false, problem: 'out-of-range' };
  return { ok: true, iso: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` };
}

/** True for a real calendar day written as YYYY-MM-DD, the stored form. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  return isCalendarDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Turns a stored YYYY-MM-DD date into DD.MM.YYYY. Other text comes back unchanged. */
export function formatDisplayDate(iso: string): string {
  return iso.replace(ISO_DATE, '$3.$2.$1');
}

/**
 * The calendar day at the given moment in the user's own time zone, as
 * YYYY-MM-DD. Start and expiry dates are compared with this value, so a code
 * stays valid until the end of its expiry day wherever the user is (PB-008).
 */
export function localToday(now: Date): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}
