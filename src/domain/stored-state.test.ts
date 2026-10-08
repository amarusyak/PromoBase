import { describe, expect, it } from 'vitest';
import type { PromoCodeRecord } from './record';
import { parseStoredState, SCHEMA_VERSION } from './stored-state';

function record(overrides: Partial<PromoCodeRecord> = {}): PromoCodeRecord {
  return {
    id: '3f6c1d2e-0000-4000-8000-000000000001',
    promoCode: 'WELCOME10',
    notify: false,
    createdAt: '2026-10-08T12:00:00.000Z',
    updatedAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

function stateWith(...records: unknown[]) {
  return { schemaVersion: SCHEMA_VERSION, records };
}

describe('parseStoredState', () => {
  it('reports empty when nothing has been stored', () => {
    expect(parseStoredState(undefined)).toEqual({ status: 'empty' });
  });

  it('accepts a state with no records', () => {
    expect(parseStoredState(stateWith())).toEqual({
      status: 'ok',
      state: { schemaVersion: SCHEMA_VERSION, records: [] },
    });
  });

  it('accepts a record with only the required fields', () => {
    const minimal = record();
    expect(parseStoredState(stateWith(minimal))).toEqual({
      status: 'ok',
      state: { schemaVersion: SCHEMA_VERSION, records: [minimal] },
    });
  });

  it('accepts a record with every field and keeps it unchanged', () => {
    const full = record({
      resourceUrl: 'https://www.example.com/plans',
      merchantDomain: 'example.com',
      startDate: '2026-10-01',
      expiryDate: '2026-12-31',
      note: 'From a creator video',
      notify: true,
    });
    const result = parseStoredState(stateWith(full));
    expect(result).toEqual({
      status: 'ok',
      state: { schemaVersion: SCHEMA_VERSION, records: [full] },
    });
  });

  it('keeps records in stored order', () => {
    const first = record({ id: 'a', promoCode: 'FIRST' });
    const second = record({ id: 'b', promoCode: 'SECOND' });
    const result = parseStoredState(stateWith(first, second));
    expect(result.status === 'ok' && result.state.records.map((r) => r.promoCode)).toEqual([
      'FIRST',
      'SECOND',
    ]);
  });

  it('reports a newer schema version without treating it as corrupt', () => {
    expect(parseStoredState({ schemaVersion: SCHEMA_VERSION + 1, records: [] })).toEqual({
      status: 'unsupported-version',
      found: SCHEMA_VERSION + 1,
    });
  });

  it.each([
    ['null', null],
    ['a string', 'promobase'],
    ['a number', 1],
    ['a bare list', [record()]],
  ])('reports corrupt when the stored value is %s', (_label, raw) => {
    expect(parseStoredState(raw)).toMatchObject({ status: 'corrupt' });
  });

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['text', '1'],
  ])('reports corrupt when schemaVersion is %s', (_label, schemaVersion) => {
    expect(parseStoredState({ schemaVersion, records: [] })).toMatchObject({ status: 'corrupt' });
  });

  it.each([
    ['missing', undefined],
    ['an object', {}],
    ['text', 'none'],
  ])('reports corrupt when records is %s', (_label, records) => {
    expect(parseStoredState({ schemaVersion: SCHEMA_VERSION, records })).toMatchObject({
      status: 'corrupt',
    });
  });

  it.each([
    ['is not an object', 'WELCOME10'],
    ['is null', null],
    ['has no id', { ...record(), id: undefined }],
    ['has an empty id', record({ id: '' })],
    ['has no promoCode', { ...record(), promoCode: undefined }],
    ['has an empty promoCode', record({ promoCode: '' })],
    ['has a non-text promoCode', { ...record(), promoCode: 10 }],
    ['has no notify', { ...record(), notify: undefined }],
    ['has a non-boolean notify', { ...record(), notify: 'true' }],
    ['has no createdAt', { ...record(), createdAt: undefined }],
    ['has no updatedAt', { ...record(), updatedAt: undefined }],
    ['has a non-text note', { ...record(), note: 140 }],
    ['has a null merchantDomain', { ...record(), merchantDomain: null }],
    ['has a non-text expiryDate', { ...record(), expiryDate: 20261231 }],
    ['has notify on without a merchantDomain', record({ notify: true })],
    ['has notify on with an empty merchantDomain', record({ notify: true, merchantDomain: '' })],
    ['has notify on with a space as merchantDomain', record({ notify: true, merchantDomain: ' ' })],
    [
      'has notify on with a whitespace-only merchantDomain',
      record({ notify: true, merchantDomain: ' \t\n\u00a0' }),
    ],
    ['has notify off with an empty merchantDomain', record({ merchantDomain: '' })],
    ['has notify off with a whitespace-only merchantDomain', record({ merchantDomain: '  ' })],
  ])('reports corrupt when a record %s', (_label, bad) => {
    const result = parseStoredState(stateWith(record({ id: 'good' }), bad));
    expect(result).toMatchObject({ status: 'corrupt' });
    expect(result.status === 'corrupt' && result.reason).toContain('record 1');
  });

  it.each([
    ['on with a merchantDomain', { notify: true, merchantDomain: 'example.com' }],
    ['off with a merchantDomain', { notify: false, merchantDomain: 'example.com' }],
    ['off without a merchantDomain', { notify: false }],
  ])('accepts notify %s', (_label, fields) => {
    expect(parseStoredState(stateWith(record(fields)))).toMatchObject({ status: 'ok' });
  });

  it('reports corrupt when two records share an id', () => {
    const result = parseStoredState(stateWith(record(), record({ promoCode: 'OTHER' })));
    expect(result).toMatchObject({ status: 'corrupt' });
  });
});
