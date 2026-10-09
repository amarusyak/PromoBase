import { describe, expect, it } from 'vitest';
import { localToday } from './dates';
import { recordStatus } from './record-status';

const TODAY = '2026-10-09';

describe('recordStatus', () => {
  it.each([
    ['no dates', {}, 'active'],
    ['a start date in the past', { startDate: '2026-10-01' }, 'active'],
    ['a start date of today', { startDate: TODAY }, 'active'],
    ['a start date of tomorrow', { startDate: '2026-10-10' }, 'upcoming'],
    ['a start date next year', { startDate: '2027-01-01' }, 'upcoming'],
    ['an expiry date in the future', { expiryDate: '2026-12-31' }, 'active'],
    ['an expiry date of today', { expiryDate: TODAY }, 'active'],
    ['an expiry date of yesterday', { expiryDate: '2026-10-08' }, 'expired'],
    ['an expiry date last year', { expiryDate: '2025-12-31' }, 'expired'],
    ['today inside the range', { startDate: '2026-10-01', expiryDate: '2026-10-31' }, 'active'],
    ['a range that is only today', { startDate: TODAY, expiryDate: TODAY }, 'active'],
    ['a range still ahead', { startDate: '2026-11-01', expiryDate: '2026-11-30' }, 'upcoming'],
    ['a range already over', { startDate: '2026-09-01', expiryDate: '2026-09-30' }, 'expired'],
  ] as const)('%s is %s', (_label, dates, expected) => {
    expect(recordStatus(dates, TODAY)).toBe(expected);
  });

  it('compares across month and year ends as dates, not as numbers', () => {
    expect(recordStatus({ expiryDate: '2026-09-30' }, '2026-10-01')).toBe('expired');
    expect(recordStatus({ expiryDate: '2026-12-31' }, '2027-01-01')).toBe('expired');
    expect(recordStatus({ startDate: '2027-01-01' }, '2026-12-31')).toBe('upcoming');
  });

  it('keeps a code active through the last millisecond of its expiry day (PB-008)', () => {
    const record = { expiryDate: '2026-12-31' };
    const lastMoment = new Date(2026, 11, 31, 23, 59, 59, 999);
    const nextMoment = new Date(lastMoment.getTime() + 1);
    expect(recordStatus(record, localToday(lastMoment))).toBe('active');
    expect(recordStatus(record, localToday(nextMoment))).toBe('expired');
  });

  it('turns an upcoming code active at local midnight of its start day (PB-008)', () => {
    const record = { startDate: '2026-11-01' };
    const lastMomentBefore = new Date(2026, 9, 31, 23, 59, 59, 999);
    const firstMoment = new Date(lastMomentBefore.getTime() + 1);
    expect(recordStatus(record, localToday(lastMomentBefore))).toBe('upcoming');
    expect(recordStatus(record, localToday(firstMoment))).toBe('active');
  });

  it('reports expired first when the dates contradict each other', () => {
    // The write path refuses a start after the expiry; this pins what a reader sees anyway.
    expect(recordStatus({ startDate: '2026-12-01', expiryDate: '2026-10-01' }, TODAY)).toBe(
      'expired',
    );
  });
});
