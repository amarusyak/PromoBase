import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { exportDocument, exportText } from './export';
import { IMPORT_MAX_BYTES, importTooLarge, parseImport, planImport } from './import';
import { RECORD_LIMIT, type PromoCodeRecord } from './record';
import { SCHEMA_VERSION } from './stored-state';

const NOW = new Date(Date.UTC(2026, 10, 9, 16, 36));
const code = (id: string, extra: Partial<PromoCodeRecord> = {}) =>
  sampleRecord({ id, promoCode: id.toUpperCase(), ...extra });
const onSite = (id: string, site: string, notify = false, extra: Partial<PromoCodeRecord> = {}) =>
  code(id, { merchantDomain: site, resourceUrl: site, notify, ...extra });
const file = (records: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'promobase-export',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: 'x',
    records,
    ...extra,
  });

describe('parseImport', () => {
  it('reads back what Export writes (D-027)', () => {
    const records = [
      onSite('a', 'shop.example', true, { note: 'n', expiryDate: '2027-01-31' }),
      code('b'),
    ];
    expect(parseImport(exportText(exportDocument(records, NOW)))).toEqual({ ok: true, records });
  });

  it.each([
    ['text that is not JSON', 'hello', 'not-json'],
    ['a JSON list', '[]', 'not-an-export'],
    ['JSON from something else', '{"records": []}', 'not-an-export'],
    [
      'a raw copy of the stored state, without the export format',
      JSON.stringify({ schemaVersion: 1, records: [] }),
      'not-an-export',
    ],
    ['another format with the same shape', file([], { format: 'other-export' }), 'not-an-export'],
    [
      'an export without records',
      JSON.stringify({ format: 'promobase-export', schemaVersion: 1 }),
      'not-an-export',
    ],
    [
      'an export without a version',
      JSON.stringify({ format: 'promobase-export', records: [] }),
      'not-an-export',
    ],
    [
      'an export from a newer PromoBase',
      file([], { schemaVersion: SCHEMA_VERSION + 1 }),
      'newer-version',
    ],
  ])('refuses %s', (_label, text, problem) => {
    expect(parseImport(text)).toEqual({ ok: false, problem });
  });

  it.each([
    ['a record without a code', [code('a'), { ...code('b'), promoCode: '' }], 2],
    ['a date that is not a day', [code('a', { expiryDate: '31.12.2026' })], 1],
    ['reminders on without a site', [code('a', { notify: true })], 1],
    ['a merchant that is not a domain', [code('a', { merchantDomain: 'Shop Example' })], 1],
    ['the same id twice', [code('a'), code('b'), code('a')], 3],
    ['null in an optional field', [{ ...code('a'), note: null }], 1],
  ])('refuses the whole file for %s, naming the record', (_label, records, number) => {
    expect(parseImport(file(records))).toEqual({
      ok: false,
      problem: 'invalid-record',
      record: number,
    });
  });

  it('drops keys this build does not know', () => {
    const parsed = parseImport(file([{ ...code('a'), legacyFlag: true }]));
    expect(parsed).toEqual({ ok: true, records: [code('a')] });
  });

  it('takes an empty export', () => {
    expect(parseImport(file([]))).toEqual({ ok: true, records: [] });
  });
});

describe('importTooLarge (review of PR #8)', () => {
  it('lets through a file up to 1 MB and refuses anything larger', () => {
    expect(IMPORT_MAX_BYTES).toBe(1024 * 1024);
    expect(importTooLarge(IMPORT_MAX_BYTES)).toBe(false);
    expect(importTooLarge(IMPORT_MAX_BYTES + 1)).toBe(true);
  });

  it('leaves room for the largest export 100 codes can make', () => {
    const longest = Array.from({ length: RECORD_LIMIT }, (_, i) =>
      code(`id-${String(i).padStart(32, '0')}`, {
        promoCode: 'C'.repeat(100),
        merchantDomain: 'shop.example',
        resourceUrl: `https://shop.example/${'ü'.repeat(1980)}`,
        note: '☕'.repeat(70),
        startDate: '2026-01-01',
        expiryDate: '2027-01-01',
      }),
    );
    const bytes = new TextEncoder().encode(exportText(exportDocument(longest, NOW))).length;
    expect(importTooLarge(bytes)).toBe(false);
    expect(bytes).toBeLessThan(IMPORT_MAX_BYTES / 2);
  });
});

describe('planImport', () => {
  it('adds new codes in file order and leaves saved ones alone', () => {
    const plan = planImport([code('a')], [code('c'), code('b')]);
    expect(plan.added.map((r) => r.id)).toEqual(['c', 'b']);
    expect(plan).toMatchObject({ sameId: [], overLimit: [], lookAlike: [] });
  });

  it('skips a code whose id is saved already, even if the file has changed it', () => {
    const plan = planImport(
      [code('a', { note: 'saved' })],
      [code('a', { note: 'from the file' }), code('b')],
    );
    expect(plan.sameId.map((r) => r.note)).toEqual(['from the file']);
    expect(plan.added.map((r) => r.id)).toEqual(['b']);
  });

  it('importing the same export twice adds nothing the second time', () => {
    const records = [code('a'), code('b')];
    expect(planImport(records, records).added).toEqual([]);
  });

  it('stops at the record limit and reports the rest (PB-003)', () => {
    const saved = Array.from({ length: RECORD_LIMIT - 2 }, (_, i) => code(`s${i}`));
    const plan = planImport(saved, [code('a'), code('s0'), code('b'), code('c'), code('d')]);
    expect(plan.added.map((r) => r.id)).toEqual(['a', 'b']);
    expect(plan.sameId.map((r) => r.id)).toEqual(['s0']);
    expect(plan.overLimit.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('points out an added code that matches a saved one for the same site, ignoring case (D-077)', () => {
    const saved = [onSite('a', 'shop.example', false, { promoCode: 'TFP10' })];
    const plan = planImport(saved, [
      onSite('b', 'shop.example', false, { promoCode: 'tfp10' }),
      onSite('c', 'other.example', false, { promoCode: 'TFP10' }),
    ]);
    expect(plan.lookAlike.map((r) => r.id)).toEqual(['b']);
    expect(plan.added.map((r) => r.id)).toEqual(['b', 'c']);
  });

  describe('reminders, switched per site (D-100)', () => {
    it('keeps them on for a site new to the library when the file has them on', () => {
      const plan = planImport(
        [],
        [onSite('a', 'shop.example', true), onSite('b', 'shop.example', false)],
      );
      expect(plan.added.map((r) => r.notify)).toEqual([true, true]);
    });

    it('leaves them off for a new site the file has off', () => {
      expect(planImport([], [onSite('a', 'shop.example')]).added[0]?.notify).toBe(false);
    });

    it("follows the saved site's switch, whatever the file says", () => {
      const saved = [onSite('s', 'on.example', true), onSite('t', 'off.example', false)];
      const plan = planImport(saved, [
        onSite('a', 'on.example', false),
        onSite('b', 'off.example', true),
      ]);
      expect(plan.added.map((r) => [r.merchantDomain, r.notify])).toEqual([
        ['on.example', true],
        ['off.example', false],
      ]);
    });

    it('has them off for a code without a site', () => {
      expect(planImport([], [code('a')]).added[0]?.notify).toBe(false);
    });

    it('does not count a skipped code towards a site being on', () => {
      const saved = [onSite('a', 'shop.example', false)];
      const plan = planImport(saved, [
        onSite('a', 'shop.example', true),
        onSite('b', 'shop.example', false),
      ]);
      expect(plan.added[0]?.notify).toBe(false);
    });
  });
});
