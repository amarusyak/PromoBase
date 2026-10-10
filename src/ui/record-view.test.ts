import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { groupRecords, merchantName, viewRecord } from './record-view';

const TODAY = '2026-10-09';

describe('merchantName', () => {
  it('shows an ordinary domain as it is', () => {
    expect(merchantName('dropbox.com')).toStrictEqual({ name: 'dropbox.com' });
  });

  it('shows an international name readably, with the stored spelling next to it', () => {
    expect(merchantName('xn--mnchen-3ya.de')).toStrictEqual({
      name: 'münchen.de',
      stored: 'xn--mnchen-3ya.de',
    });
  });

  it('keeps the stored spelling visible for a name built to look like another', () => {
    // Cyrillic letters that look like "apple".
    const lookalike = new URL('https://аррӏе.com/').hostname;
    expect(merchantName(lookalike).stored).toBe(lookalike);
    expect(lookalike.startsWith('xn--')).toBe(true);
  });
});

describe('viewRecord', () => {
  it('shows a code-only record as active with nothing else', () => {
    expect(viewRecord(sampleRecord({ id: 'a' }), TODAY)).toStrictEqual({
      id: 'a',
      code: 'WELCOME10',
      status: 'active',
      statusLabel: 'Active',
    });
  });

  it('shows merchant, status, dates and note of a full record (PB-009)', () => {
    const record = sampleRecord({
      id: 'a',
      promoCode: 'Cloud25',
      resourceUrl: 'https://www.dropbox.com/plans',
      merchantDomain: 'dropbox.com',
      startDate: '2026-10-01',
      expiryDate: '2026-12-31',
      note: '2 TB plan discount',
    });
    expect(viewRecord(record, TODAY)).toStrictEqual({
      id: 'a',
      code: 'Cloud25',
      merchant: { name: 'dropbox.com' },
      status: 'active',
      statusLabel: 'Active',
      dates: 'Expires 31.12.2026',
      note: '2 TB plan discount',
    });
  });

  it.each([
    ['no dates', {}, 'Active', undefined],
    ['a start date in the past', { startDate: '2026-10-01' }, 'Active', undefined],
    ['an expiry date ahead', { expiryDate: '2026-12-31' }, 'Active', 'Expires 31.12.2026'],
    ['an expiry date of today', { expiryDate: TODAY }, 'Active', 'Expires today'],
    ['an expiry date of yesterday', { expiryDate: '2026-10-08' }, 'Expired', 'Expired 08.10.2026'],
    ['a start date ahead', { startDate: '2026-11-01' }, 'Upcoming', 'Starts 01.11.2026'],
    [
      'a start and an expiry date ahead',
      { startDate: '2026-11-01', expiryDate: '2026-11-30' },
      'Upcoming',
      'Starts 01.11.2026, expires 30.11.2026',
    ],
    [
      'a range that is over',
      { startDate: '2026-09-01', expiryDate: '2026-09-30' },
      'Expired',
      'Expired 30.09.2026',
    ],
  ])('for %s shows %s and %j (PB-008)', (_label, dates, statusLabel, line) => {
    const view = viewRecord(sampleRecord(dates), TODAY);
    expect(view.statusLabel).toBe(statusLabel);
    expect(view.dates).toBe(line);
  });

  it('leaves out a note that holds nothing but spaces', () => {
    expect(viewRecord(sampleRecord({ note: '  ' }), TODAY)).not.toHaveProperty('note');
  });

  it('keeps the code exactly as saved, for copying', () => {
    expect(viewRecord(sampleRecord({ promoCode: 'Save 10 Now' }), TODAY).code).toBe('Save 10 Now');
  });
});

describe('groupRecords', () => {
  const made = (promoCode: string, minute: number, dates = {}) =>
    sampleRecord({
      id: promoCode,
      promoCode,
      createdAt: new Date(Date.UTC(2026, 9, 1, 12, minute)).toISOString(),
      ...dates,
    });

  it('groups by status in the order active, upcoming, expired, newest first in each', () => {
    const groups = groupRecords(
      [
        made('EXPIRED-OLD', 1, { expiryDate: '2026-09-30' }),
        made('ACTIVE-OLD', 2),
        made('UPCOMING', 3, { startDate: '2026-11-01' }),
        made('ACTIVE-NEW', 4),
        made('EXPIRED-NEW', 5, { expiryDate: '2026-01-31' }),
      ],
      TODAY,
    );
    expect(groups.map((group) => [group.label, group.rows.map((row) => row.code)])).toEqual([
      ['Active', ['ACTIVE-NEW', 'ACTIVE-OLD']],
      ['Upcoming', ['UPCOMING']],
      ['Expired', ['EXPIRED-NEW', 'EXPIRED-OLD']],
    ]);
  });

  it('leaves out a group that has no records', () => {
    const groups = groupRecords([made('A', 1), made('B', 2, { expiryDate: '2026-01-01' })], TODAY);
    expect(groups.map((group) => group.status)).toEqual(['active', 'expired']);
  });

  it('gives no groups for no records', () => {
    expect(groupRecords([], TODAY)).toEqual([]);
  });

  it('moves a code to Expired the day after its expiry date', () => {
    const records = [made('ENDS', 1, { expiryDate: TODAY })];
    expect(groupRecords(records, TODAY)[0]?.label).toBe('Active');
    expect(groupRecords(records, '2026-10-10')[0]?.label).toBe('Expired');
  });
});
