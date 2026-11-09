import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import type { ImportPlan } from '../domain/import';
import type { PromoCodeRecord } from '../domain/record';
import { importReport } from './import-report';

const code = (promoCode: string, merchantDomain?: string): PromoCodeRecord =>
  sampleRecord({
    id: promoCode,
    promoCode,
    ...(merchantDomain === undefined ? {} : { merchantDomain }),
  });
const plan = (overrides: Partial<ImportPlan>): ImportPlan => ({
  added: [],
  sameId: [],
  overLimit: [],
  lookAlike: [],
  ...overrides,
});

describe('importReport', () => {
  it('counts what was added, with no warnings when nothing needs a look', () => {
    expect(importReport(plan({ added: [code('A'), code('B')] }))).toEqual({
      summary: 'Added 2 codes.',
      warnings: [],
    });
    expect(importReport(plan({ added: [code('A')] })).summary).toBe('Added 1 code.');
  });

  it('says so when nothing was added', () => {
    expect(importReport(plan({ sameId: [code('A')] })).summary).toBe('No codes were added.');
  });

  it('names every code skipped because it is saved already, with its site', () => {
    const report = importReport(plan({ sameId: [code('TFP10', 'shop.example'), code('NOSITE')] }));
    expect(report.warnings).toEqual([
      "2 codes already saved here, so the saved ones were kept and the file's skipped: TFP10 (shop.example), NOSITE.",
    ]);
  });

  it('names the codes that did not fit and says how to get them in', () => {
    const report = importReport(plan({ overLimit: [code('A')] }));
    expect(report.warnings[0]).toBe(
      '1 code not added, because PromoBase keeps 100 codes at most: A. Delete codes you no longer need and import the file again.',
    );
  });

  it('points out added codes that match saved ones', () => {
    const report = importReport(
      plan({ added: [code('X', 'münchen.de')], lookAlike: [code('X', 'xn--mnchen-3ya.de')] }),
    );
    expect(report.warnings[0]).toBe(
      '1 code added that matches a code already saved for the same site: X (münchen.de). Delete any you do not need twice.',
    );
  });

  it('names five codes at most and counts the rest', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => code(c));
    expect(importReport(plan({ sameId: many })).warnings[0]).toContain('A, B, C, D, E and 2 more.');
  });

  it('lists the warnings in a fixed order', () => {
    const report = importReport(
      plan({ sameId: [code('A')], overLimit: [code('B')], lookAlike: [code('C')] }),
    );
    expect(report.warnings.map((w) => w.split(' ').slice(2, 4).join(' '))).toEqual([
      'already saved',
      'not added,',
      'added that',
    ]);
  });
});
