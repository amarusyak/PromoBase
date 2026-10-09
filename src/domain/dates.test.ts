import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDisplayDate,
  isIsoDate,
  localToday,
  MAX_YEAR,
  MIN_YEAR,
  parseDisplayDate,
} from './dates';

describe('parseDisplayDate', () => {
  it.each([
    ['31.12.2026', '2026-12-31'],
    ['01.01.2026', '2026-01-01'],
    ['09.10.2026', '2026-10-09'],
    ['30.04.2027', '2027-04-30'],
    ['28.02.2026', '2026-02-28'],
    ['29.02.2028', '2028-02-29'],
    // Divisible by 400, so a leap year.
    ['29.02.2000', '2000-02-29'],
    ['  31.12.2026  ', '2026-12-31'],
    ['\t31.12.2026\n', '2026-12-31'],
  ])('reads %j as %s', (text, iso) => {
    expect(parseDisplayDate(text)).toEqual({ ok: true, iso });
  });

  it.each([
    ['nothing', ''],
    ['whitespace', '   '],
    ['words', 'tomorrow'],
    ['the stored form', '2026-12-31'],
    ['slashes', '31/12/2026'],
    ['dashes', '31-12-2026'],
    ['a one-digit day', '1.12.2026'],
    ['a one-digit month', '31.1.2026'],
    ['a two-digit year', '31.12.26'],
    ['a five-digit year', '31.12.20260'],
    ['a three-digit day', '031.12.2026'],
    ['a missing year', '31.12.'],
    ['a trailing dot', '31.12.2026.'],
    ['a time after the date', '31.12.2026 10:00'],
    ['a space inside', '31. 12.2026'],
    ['a sign', '-1.12.2026'],
    ['a decimal comma', '31,12,2026'],
    ['digits from another script', '٣١.١٢.٢٠٢٦'],
    ['full-width digits', '３１.１２.２０２６'],
    ['two dates', '31.12.2026 01.01.2027'],
  ])('rejects %s as a format problem', (_label, text) => {
    expect(parseDisplayDate(text)).toEqual({ ok: false, problem: 'format' });
  });

  it.each([
    ['day zero', '00.12.2026'],
    ['month zero', '31.00.2026'],
    ['month thirteen', '01.13.2026'],
    ['day thirty-two', '32.01.2026'],
    ['the 31st of a 30-day month', '31.04.2026'],
    ['the 30th of February', '30.02.2028'],
    ['the 29th of February in an ordinary year', '29.02.2026'],
    // Divisible by 100 but not by 400, so not a leap year.
    ['the 29th of February 2100', '29.02.2100'],
    ['the 29th of February 1900', '29.02.1900'],
    ['day and month swapped', '12.31.2026'],
    ['all zeros', '00.00.0000'],
  ])('rejects %s as not a date', (_label, text) => {
    expect(parseDisplayDate(text)).toEqual({ ok: false, problem: 'not-a-date' });
  });

  it('accepts the first and the last day of the allowed years', () => {
    expect(parseDisplayDate(`01.01.${MIN_YEAR}`)).toEqual({ ok: true, iso: `${MIN_YEAR}-01-01` });
    expect(parseDisplayDate(`31.12.${MAX_YEAR}`)).toEqual({ ok: true, iso: `${MAX_YEAR}-12-31` });
  });

  it.each([
    ['the day before the first allowed year', `31.12.${MIN_YEAR - 1}`],
    ['the day after the last allowed year', `01.01.${MAX_YEAR + 1}`],
    ['a year typed with leading zeros', '31.12.0026'],
    ['the year 9999', '31.12.9999'],
  ])('rejects %s as out of range', (_label, text) => {
    expect(parseDisplayDate(text)).toEqual({ ok: false, problem: 'out-of-range' });
  });
});

describe('isIsoDate', () => {
  it.each(['2026-12-31', '2026-01-01', '2028-02-29', '2000-02-29', '1999-12-31', '0026-12-31'])(
    'accepts %s',
    (value) => {
      expect(isIsoDate(value)).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['the typed form', '31.12.2026'],
    ['padded', ' 2026-12-31'],
    ['a timestamp', '2026-12-31T00:00:00.000Z'],
    ['no zero padding', '2026-1-1'],
    ['a two-digit year', '26-12-31'],
    ['month thirteen', '2026-13-01'],
    ['day zero', '2026-12-00'],
    ['the 30th of February', '2028-02-30'],
    ['the 29th of February in an ordinary year', '2026-02-29'],
    ['the 29th of February 1900', '1900-02-29'],
    ['the 31st of a 30-day month', '2026-11-31'],
    ['words', 'tomorrow'],
  ])('rejects %s', (_label, value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

describe('formatDisplayDate', () => {
  it('shows a stored date as DD.MM.YYYY', () => {
    expect(formatDisplayDate('2026-12-31')).toBe('31.12.2026');
    expect(formatDisplayDate('2026-01-09')).toBe('09.01.2026');
  });

  it('returns text that is not a stored date unchanged', () => {
    expect(formatDisplayDate('tomorrow')).toBe('tomorrow');
    expect(formatDisplayDate('')).toBe('');
  });

  it.each(['01.01.2000', '29.02.2028', '09.10.2026', '31.12.2100'])(
    'gives back %s after it was parsed',
    (text) => {
      const parsed = parseDisplayDate(text);
      expect(parsed.ok && formatDisplayDate(parsed.iso)).toBe(text);
    },
  );
});

describe('localToday', () => {
  // new Date(year, monthIndex, ...) is built from local time, so these hold in any time zone.
  it('reads the local calendar day, not the UTC one', () => {
    expect(localToday(new Date(2026, 9, 9, 0, 0, 0, 0))).toBe('2026-10-09');
    expect(localToday(new Date(2026, 9, 9, 23, 59, 59, 999))).toBe('2026-10-09');
  });

  it('moves to the next day at local midnight', () => {
    const lastMoment = new Date(2026, 11, 31, 23, 59, 59, 999);
    const nextMoment = new Date(lastMoment.getTime() + 1);
    expect(localToday(lastMoment)).toBe('2026-12-31');
    expect(localToday(nextMoment)).toBe('2027-01-01');
  });

  it('pads single-digit months and days', () => {
    expect(localToday(new Date(2027, 0, 5, 12))).toBe('2027-01-05');
  });

  it('gives a value that is a stored date', () => {
    expect(isIsoDate(localToday(new Date(2028, 1, 29, 8)))).toBe(true);
  });
});

// The machine's own zone must not decide whether these pass: on a machine set
// to UTC, reading the UTC day by mistake would otherwise go unnoticed.
describe('localToday in a given time zone', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [
      'ahead of UTC, already tomorrow',
      'Pacific/Kiritimati',
      '2026-10-09T12:00:00.000Z',
      '2026-10-10',
    ],
    ['behind UTC, still yesterday', 'Pacific/Honolulu', '2026-10-09T05:00:00.000Z', '2026-10-08'],
    ['UTC itself', 'UTC', '2026-10-09T23:59:59.999Z', '2026-10-09'],
    ['just after local midnight', 'Europe/Berlin', '2026-10-09T22:00:00.000Z', '2026-10-10'],
    ['just before local midnight', 'Europe/Berlin', '2026-10-09T21:59:59.999Z', '2026-10-09'],
    // Clocks go back on 25 October 2026 in this zone, so that day lasts 25 hours.
    [
      'the first minute of a 25-hour day',
      'Europe/Berlin',
      '2026-10-24T22:00:00.000Z',
      '2026-10-25',
    ],
    ['the last minute of a 25-hour day', 'Europe/Berlin', '2026-10-25T22:59:00.000Z', '2026-10-25'],
    ['the minute after a 25-hour day', 'Europe/Berlin', '2026-10-25T23:00:00.000Z', '2026-10-26'],
  ])('%s (%s)', (_label, zone, instant, expected) => {
    vi.stubEnv('TZ', zone);
    expect(localToday(new Date(instant))).toBe(expected);
  });
});
