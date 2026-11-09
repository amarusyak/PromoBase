import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import {
  EXPORT_FORMAT,
  exportDocument,
  exportFileName,
  exportText,
  savedDataFileName,
  savedDataText,
} from './export';
import type { PromoCodeRecord } from './record';
import { parseStoredState, SCHEMA_VERSION } from './stored-state';

const NOW = new Date(Date.UTC(2026, 10, 9, 15, 30, 0));

const full: PromoCodeRecord = {
  updatedAt: '2026-11-02T09:00:00.000Z',
  createdAt: '2026-11-01T09:00:00.000Z',
  notify: true,
  note: '10% off the next order',
  expiryDate: '2027-01-31',
  startDate: '2026-11-01',
  merchantDomain: 'shop.example',
  resourceUrl: 'https://www.shop.example/coffee',
  promoCode: 'TFP10',
  id: '3f6c1d2e-0000-4000-8000-000000000009',
};

describe('exportDocument', () => {
  it('names the format and the stored layout, and says when it was made (D-027)', () => {
    const document = exportDocument([], NOW);
    expect(document).toEqual({
      format: EXPORT_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-11-09T15:30:00.000Z',
      records: [],
    });
  });

  it('writes every field in a fixed order, whatever order storage gave (D-079)', () => {
    const [record] = exportDocument([full], NOW).records;
    expect(Object.keys(record ?? {})).toEqual([
      'id',
      'promoCode',
      'resourceUrl',
      'merchantDomain',
      'startDate',
      'expiryDate',
      'note',
      'notify',
      'createdAt',
      'updatedAt',
    ]);
    expect(record).toEqual(full);
  });

  it('leaves out fields a record does not have, and keys this build does not know', () => {
    const extra = { ...sampleRecord(), legacyFlag: true } as PromoCodeRecord;
    const [record] = exportDocument([extra], NOW).records;
    expect(Object.keys(record ?? {})).toEqual([
      'id',
      'promoCode',
      'notify',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('keeps the records in their stored order', () => {
    const records = ['c', 'a', 'b'].map((id) => sampleRecord({ id, promoCode: id.toUpperCase() }));
    expect(exportDocument(records, NOW).records.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('gives records the read side accepts as they are', () => {
    const records = exportDocument([full, sampleRecord()], NOW).records;
    const parsed = parseStoredState({ schemaVersion: SCHEMA_VERSION, records });
    expect(parsed).toEqual({ status: 'ok', state: { schemaVersion: SCHEMA_VERSION, records } });
  });
});

describe('exportText', () => {
  it('is indented JSON that reads back to the same document, ending with a line break', () => {
    const document = exportDocument([full], NOW);
    const text = exportText(document);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "records": [\n');
    expect(JSON.parse(text)).toEqual(document);
  });

  it('keeps international names and notes as written', () => {
    const record = sampleRecord({ note: 'Rabatt für Kaffee ☕' });
    expect(exportText(exportDocument([record], NOW))).toContain('Rabatt für Kaffee ☕');
  });
});

describe('exportFileName', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['ahead of UTC', 'Pacific/Kiritimati', '2026-11-09T10:30:00.000Z', '2026-11-10-00-30'],
    ['behind UTC', 'Pacific/Honolulu', '2026-11-09T05:30:00.000Z', '2026-11-08-19-30'],
    ['a half-hour zone', 'Asia/Kolkata', '2026-11-09T12:05:00.000Z', '2026-11-09-17-35'],
  ])(
    'uses the local day and time where they differ from UTC: %s',
    (_label, zone, instant, stamp) => {
      vi.stubEnv('TZ', zone);
      expect(exportFileName(new Date(instant))).toBe(`promobase-codes-${stamp}.json`);
    },
  );

  it('is stamped with the local day and time to the minute, padded', () => {
    expect(exportFileName(new Date(2026, 10, 9, 23, 59, 59))).toBe(
      'promobase-codes-2026-11-09-23-59.json',
    );
    expect(exportFileName(new Date(2026, 0, 1, 7, 5))).toBe(
      'promobase-codes-2026-01-01-07-05.json',
    );
  });
});

describe('savedDataText (D-124)', () => {
  it('copies the stored value exactly: same keys, same order, nothing checked or left out', () => {
    const stored = {
      schemaVersion: 1,
      records: [{ promoCode: 'X', id: 'a', unknownField: [1, 2], notify: 'not a boolean' }],
      extra: null,
    };
    const text = savedDataText(stored);
    expect(JSON.parse(text)).toEqual(stored);
    expect(text).toBe(`${JSON.stringify(stored, null, 2)}\n`);
    expect(text.indexOf('"promoCode"')).toBeLessThan(text.indexOf('"id"'));
  });

  it.each([
    ['a newer layout', { schemaVersion: SCHEMA_VERSION + 1, records: 'shape unknown' }],
    ['a list', [1, 'two']],
    ['text', 'not an object'],
    ['a number', 42],
  ])('copies %s as it is', (_label, stored) => {
    expect(JSON.parse(savedDataText(stored))).toEqual(stored);
  });
});

describe('savedDataFileName (D-124)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is named like the export, in local time, so the two are not confused', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata');
    expect(savedDataFileName(new Date('2026-11-09T12:05:00.000Z'))).toBe(
      'promobase-saved-data-2026-11-09-17-35.json',
    );
  });
});
