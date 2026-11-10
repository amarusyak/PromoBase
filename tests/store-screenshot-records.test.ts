import { describe, expect, it } from 'vitest';
import { isIsoDate, localToday } from '../src/domain/dates';
import { recordStatus } from '../src/domain/record-status';
import { parseStoredState, SCHEMA_VERSION } from '../src/domain/stored-state';
import { storeRecords } from '../tools/store-screenshot-records.mjs';

// The store screenshots (D-117) show codes dated from the day of the run, so
// they look current. What the screenshots show must not depend on that day.

const EXPECTED = {
  r1: 'active',
  r2: 'active',
  r3: 'upcoming',
  r4: 'active',
  r5: 'active',
  r6: 'expired',
  r7: 'active',
};

/** Every day from 1 Jan 2026 to 31 Dec 2029, a leap year and every month end included. */
function everyDay(): string[] {
  const days: string[] = [];
  for (let d = new Date(2026, 0, 1); d.getFullYear() < 2030; d.setDate(d.getDate() + 1)) {
    days.push(localToday(d));
  }
  return days;
}

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

describe('storeRecords', () => {
  const days = everyDay();

  it('covers four years', () => {
    expect(days).toHaveLength(1461);
  });

  it('gives every code the same status on any day', () => {
    for (const today of days) {
      const statuses = Object.fromEntries(
        storeRecords(today).map((r) => [r.id, recordStatus(r, today)]),
      );
      expect(statuses, today).toEqual(EXPECTED);
    }
  });

  it('keeps every date at least four weeks from a change of status, or a day past it', () => {
    for (const today of days) {
      const [r1, , r3, r4, , r6] = storeRecords(today);
      expect(daysBetween(today, r1!.expiryDate!), today).toBeGreaterThanOrEqual(28);
      expect(daysBetween(today, r3!.startDate!), today).toBeGreaterThanOrEqual(28);
      expect(daysBetween(today, r4!.expiryDate!), today).toBeGreaterThanOrEqual(28);
      expect(daysBetween(r6!.expiryDate!, today), today).toBeGreaterThanOrEqual(1);
    }
  });

  it('writes real calendar days, with the upcoming code ending after it starts', () => {
    for (const today of days) {
      for (const r of storeRecords(today)) {
        for (const date of [r.startDate, r.expiryDate]) {
          if (date !== undefined) expect(isIsoDate(date), `${today} ${r.id} ${date}`).toBe(true);
        }
        if (r.startDate !== undefined) expect(r.expiryDate! > r.startDate, today).toBe(true);
      }
    }
  });

  it('passes the read-side check, as the screenshots store them', () => {
    const parsed = parseStoredState({
      schemaVersion: SCHEMA_VERSION,
      records: storeRecords('2026-12-31'),
    });
    expect(parsed.status).toBe('ok');
  });

  it('uses made-up .example shops only', () => {
    for (const r of storeRecords('2026-11-10')) {
      if (r.merchantDomain !== undefined) expect(r.merchantDomain).toMatch(/\.example$/);
    }
  });
});
