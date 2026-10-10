import { describe, expect, it } from 'vitest';
import type { LoadResult } from '../data/load-state';
import type { PromoCodeRecord } from '../domain/record';
import { RECORD_LIMIT } from '../domain/record';
import { SCHEMA_VERSION } from '../domain/stored-state';
import { summarizeState } from './state-summary';

function okWith(count: number): LoadResult {
  const records: PromoCodeRecord[] = Array.from({ length: count }, (_unused, index) => ({
    id: `id-${index}`,
    promoCode: `CODE${index}`,
    notify: false,
    createdAt: '2026-10-08T12:00:00.000Z',
    updatedAt: '2026-10-08T12:00:00.000Z',
  }));
  return { status: 'ok', state: { schemaVersion: SCHEMA_VERSION, records } };
}

describe('summarizeState', () => {
  it('treats a fresh install as zero saved codes', () => {
    expect(summarizeState({ status: 'empty' })).toEqual({
      kind: 'ready',
      records: [],
      savedCount: 0,
      capacityText: '0 of 100 codes saved',
      atLimit: false,
    });
  });

  it.each([0, 1, 99, RECORD_LIMIT])('shows the count against the limit for %i records', (count) => {
    expect(summarizeState(okWith(count))).toMatchObject({
      kind: 'ready',
      savedCount: count,
      capacityText: `${count} of 100 codes saved`,
    });
  });

  it('hands on the records in stored order', () => {
    const loaded = okWith(3);
    const summary = summarizeState(loaded);
    expect(summary.kind === 'ready' && summary.records.map((record) => record.id)).toEqual([
      'id-0',
      'id-1',
      'id-2',
    ]);
  });

  it.each([
    [RECORD_LIMIT - 1, false],
    [RECORD_LIMIT, true],
    [RECORD_LIMIT + 1, true],
  ])('with %i records, reports the limit as reached: %s (PB-003)', (count, atLimit) => {
    expect(summarizeState(okWith(count))).toMatchObject({ atLimit });
  });

  it.each<LoadResult>([
    { status: 'unsupported-version', found: SCHEMA_VERSION + 1 },
    { status: 'corrupt', reason: 'internal-detail' },
    { status: 'unavailable', reason: 'internal-detail' },
  ])('explains a $status result in plain language', (result) => {
    const summary = summarizeState(result);
    expect(summary.kind).toBe('problem');
    const message = summary.kind === 'problem' ? summary.message : '';
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain('internal-detail');
  });

  it('gives each problem its own message', () => {
    const messages = (
      [
        { status: 'unsupported-version', found: 2 },
        { status: 'corrupt', reason: 'x' },
        { status: 'unavailable', reason: 'x' },
      ] satisfies LoadResult[]
    ).map((result) => {
      const summary = summarizeState(result);
      return summary.kind === 'problem' ? summary.message : '';
    });
    expect(new Set(messages).size).toBe(3);
  });
});
