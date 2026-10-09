import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT, isBlankInput, parseDraft } from './draft';

describe('isBlankInput', () => {
  it('is true for the empty form and for fields holding only spaces', () => {
    expect(isBlankInput(EMPTY_INPUT)).toBe(true);
    expect(isBlankInput({ ...EMPTY_INPUT, promoCode: '  ', note: '\n' })).toBe(true);
  });

  it.each([
    'promoCode',
    'resourceUrl',
    'merchantDomain',
    'startDate',
    'expiryDate',
    'note',
  ] as const)('is false once %s has text', (field) => {
    expect(isBlankInput({ ...EMPTY_INPUT, [field]: 'x' })).toBe(false);
  });
});

describe('parseDraft', () => {
  const draft = { ...EMPTY_INPUT, promoCode: 'CLOUD25', resourceUrl: 'dropbox.com' };

  it('returns a stored draft', () => {
    expect(parseDraft(draft)).toStrictEqual(draft);
  });

  it('keeps text exactly as typed, including text validation would reject', () => {
    const rough = { ...EMPTY_INPUT, promoCode: ' cloud ', expiryDate: '31.1' };
    expect(parseDraft(rough)).toStrictEqual(rough);
  });

  it('drops anything the form has no field for', () => {
    expect(parseDraft({ ...draft, extra: 'x', notify: true })).toStrictEqual(draft);
  });

  it.each([
    ['nothing stored', undefined],
    ['null', null],
    ['text', 'CLOUD25'],
    ['a list', [draft]],
    ['a draft with a field missing', { promoCode: 'CLOUD25' }],
    ['a draft with a field that is not text', { ...draft, note: 140 }],
    ['a draft with nothing typed', { ...EMPTY_INPUT, promoCode: ' ' }],
  ])('ignores %s', (_label, raw) => {
    expect(parseDraft(raw)).toBeUndefined();
  });
});
