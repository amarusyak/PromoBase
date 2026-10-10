import { describe, expect, it } from 'vitest';
import { parseDisplayDate } from '../domain/dates';
import { completeDateYear, maskDateInput } from './date-mask';

/** Types the text one character at a time, as a person would. */
function type(text: string, start = ''): string {
  let value = start;
  for (const char of text) value = maskDateInput(value, value + char);
  return value;
}

describe('maskDateInput', () => {
  it.each([
    ['3', '3'],
    ['31', '31.'],
    ['311', '31.1'],
    ['3112', '31.12.'],
    ['31122', '31.12.2'],
    ['31122026', '31.12.2026'],
  ])('puts the dots in while digits are typed: %s gives %s', (typed, shown) => {
    expect(type(typed)).toBe(shown);
  });

  it.each([
    ['dots typed by hand', '31.12.2026', '31.12.2026'],
    ['slashes', '31/12/2026', '31.12.2026'],
    ['dashes', '31-12-2026', '31.12.2026'],
    ['spaces', '31 12 2026', '31.12.2026'],
    ['a one-digit day and month', '1.2.2026', '01.02.2026'],
    ['a one-digit day, then digits', '1.122026', '01.12.2026'],
    ['letters in between', '31a12b2026', '31.12.2026'],
    ['more digits than a date has', '311220269999', '31.12.2026'],
    ['a separator typed twice', '31..12..2026', '31.12.2026'],
    ['a separator before any digit', '.31122026', '31.12.2026'],
  ])('accepts %s', (_label, typed, shown) => {
    expect(type(typed)).toBe(shown);
  });

  it.each([
    ['digits only', '31122026', '31.12.2026'],
    ['slashes', '31/12/2026', '31.12.2026'],
    ['the stored form, year first', '2026-12-31', '31.12.2026'],
    ['the stored form with spaces around it', ' 2026-12-31 ', '31.12.2026'],
    ['one-digit day and month', '1.2.2026', '01.02.2026'],
  ])('formats a pasted date: %s', (_label, pasted, shown) => {
    expect(maskDateInput('', pasted)).toBe(shown);
  });

  it('leaves the text alone while characters are removed', () => {
    expect(maskDateInput('31.12.', '31.12')).toBe('31.12');
    expect(maskDateInput('31.', '31')).toBe('31');
    expect(maskDateInput('31.12.2026', '31.1.2026')).toBe('31.1.2026');
    expect(maskDateInput('3', '')).toBe('');
  });

  it('carries on after a correction', () => {
    const afterBackspaces = maskDateInput('31.12.', '31.1');
    expect(type('12026', afterBackspaces)).toBe('31.11.2026');
    expect(type('2', maskDateInput('31.', '31'))).toBe('31.2');
  });

  it('replaces the whole field when new text is pasted over a selection', () => {
    expect(maskDateInput('01.01.2026', '31.12.2027')).toBe('31.12.2027');
  });

  it('does not judge the date: that is left to validation', () => {
    expect(type('99999999')).toBe('99.99.9999');
    expect(parseDisplayDate(type('99999999'))).toEqual({ ok: false, problem: 'not-a-date' });
  });

  it.each(['01.01.2000', '29.02.2028', '09.10.2026', '31.12.2100'])(
    'gives %s when its digits are typed, in a form validation accepts',
    (date) => {
      const typed = type(date.replaceAll('.', ''));
      expect(typed).toBe(date);
      expect(parseDisplayDate(typed).ok).toBe(true);
    },
  );
});

describe('completeDateYear', () => {
  it.each([
    ['12.12.26', '12.12.2026'],
    ['01.01.00', '01.01.2000'],
    ['31.12.99', '31.12.2099'],
    [' 12.12.26 ', '12.12.2026'],
  ])('writes out the year of %j as %s', (typed, completed) => {
    expect(completeDateYear(typed)).toBe(completed);
  });

  it.each([
    ['a date with its full year', '12.12.2026'],
    ['an empty field', ''],
    ['a date still being typed', '12.12.'],
    ['a one-digit year', '12.12.2'],
    ['a three-digit year', '12.12.202'],
    ['a one-digit day', '1.12.26'],
    ['other separators', '12/12/26'],
    ['words', 'soon'],
  ])('leaves %s as it is', (_label, typed) => {
    expect(completeDateYear(typed)).toBe(typed);
  });

  it('completes what the mask produces when six digits are typed', () => {
    const typed = type('121226');
    expect(typed).toBe('12.12.26');
    expect(parseDisplayDate(typed)).toEqual({ ok: false, problem: 'format' });
    expect(parseDisplayDate(completeDateYear(typed))).toEqual({ ok: true, iso: '2026-12-12' });
  });

  it('does not make an impossible date possible', () => {
    expect(parseDisplayDate(completeDateYear('31.02.26'))).toEqual({
      ok: false,
      problem: 'not-a-date',
    });
  });

  it('changes nothing when applied a second time', () => {
    expect(completeDateYear(completeDateYear('12.12.26'))).toBe('12.12.2026');
  });
});
