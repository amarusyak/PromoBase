import { describe, expect, it } from 'vitest';
import { deriveMerchantDomain } from '../domain/derive-merchant-domain';
import { EMPTY_INPUT } from './draft';
import { validateRecordInput, type RecordInput } from '../domain/record-input';
import {
  changeFailureMessage,
  errorMessages,
  FIELD_ORDER,
  LIMIT_REACHED,
  unreadableMessage,
  warningMessage,
} from './messages';

/** The sentence shown for each field when this is typed into the form. */
function messagesFor(typed: Partial<RecordInput>) {
  const result = validateRecordInput({ ...EMPTY_INPUT, promoCode: 'WELCOME10', ...typed });
  return result.ok ? {} : errorMessages(result.errors);
}

describe('errorMessages', () => {
  it.each<[string, Partial<RecordInput>, keyof RecordInput, string]>([
    ['a blank code', { promoCode: ' ' }, 'promoCode', 'Enter the promo code.'],
    [
      'a code that is too long',
      { promoCode: 'C'.repeat(101) },
      'promoCode',
      'up to 100 characters',
    ],
    [
      'words as the address',
      { resourceUrl: 'seen in a video' },
      'resourceUrl',
      'not a website address',
    ],
    ['a script link', { resourceUrl: 'javascript:alert(1)' }, 'resourceUrl', 'http or https'],
    ['an email address', { resourceUrl: 'deals@example.com' }, 'resourceUrl', 'the @'],
    ['an IP address', { resourceUrl: '192.168.0.1' }, 'resourceUrl', 'not a numeric address'],
    ['a one-word name', { resourceUrl: 'dropbox' }, 'resourceUrl', 'with its ending'],
    ['a shared suffix', { resourceUrl: 'co.uk' }, 'resourceUrl', 'shared by many sites'],
    [
      'an address that is too long',
      { resourceUrl: `https://example.com/${'p'.repeat(2000)}` },
      'resourceUrl',
      'up to 2000 characters',
    ],
    [
      'a correction without an address',
      { merchantDomain: 'dropbox.com' },
      'merchantDomain',
      'website or link first',
    ],
    [
      'a correction that is not a site',
      { resourceUrl: 'short.example', merchantDomain: 'the shop' },
      'merchantDomain',
      'not a website address',
    ],
    ['a date in another form', { startDate: '2026-10-01' }, 'startDate', 'DD.MM.YYYY'],
    ['a day that does not exist', { expiryDate: '31.02.2026' }, 'expiryDate', 'does not exist'],
    ['a year out of range', { expiryDate: '31.12.1999' }, 'expiryDate', 'from 2000 to 2100'],
    [
      'an expiry before the start',
      { startDate: '10.10.2026', expiryDate: '09.10.2026' },
      'expiryDate',
      'earlier than the start date',
    ],
    ['a note that is too long', { note: 'n'.repeat(141) }, 'note', 'up to 140 characters'],
  ])('for %s says what to correct', (_label, typed, field, expected) => {
    const shown = messagesFor(typed);
    expect(Object.keys(shown)).toEqual([field]);
    expect(shown[field]).toContain(expected);
  });

  it('has a full sentence for every reason an address can be refused', () => {
    const refused = ['x y', 'ftp://example.com', 'a@b.com', '10.0.0.1', 'localhost', 'github.io'];
    const sentences = refused.map((text) => {
      const derived = deriveMerchantDomain(text);
      if (derived.ok || derived.problem === 'empty') throw new Error(`${text} was not refused`);
      return errorMessages({ resourceUrl: derived.problem }).resourceUrl ?? '';
    });
    expect(new Set(sentences).size).toBe(refused.length);
    for (const sentence of sentences) expect(sentence).toMatch(/^[A-Z].+\.$/);
  });

  it('reports every field at once', () => {
    expect(
      Object.keys(
        messagesFor({ promoCode: '', resourceUrl: 'x y', startDate: '1', note: 'n'.repeat(141) }),
      ),
    ).toEqual(['promoCode', 'resourceUrl', 'startDate', 'note']);
  });

  it('lists every field of the form once, in the order they are shown', () => {
    expect([...FIELD_ORDER].sort()).toEqual(Object.keys(EMPTY_INPUT).sort());
    expect(FIELD_ORDER[0]).toBe('promoCode');
  });
});

describe('warningMessage', () => {
  it('names the site of a duplicate, in its readable spelling', () => {
    const fields = { promoCode: 'A', merchantDomain: 'xn--mnchen-3ya.de' };
    expect(warningMessage('duplicate', fields)).toContain('for münchen.de.');
  });

  it('says so when the duplicate has no site', () => {
    expect(warningMessage('duplicate', { promoCode: 'A' })).toContain('without a site');
  });

  it('says that saving is still possible', () => {
    expect(warningMessage('duplicate', { promoCode: 'A' })).toContain('Saving adds it');
    expect(warningMessage('already-expired', { promoCode: 'A' })).toContain('will be saved');
  });
});

describe('messages for a change that did not go through', () => {
  it('explains the limit and the next step (PB-003)', () => {
    expect(LIMIT_REACHED).toContain('100 codes');
    expect(LIMIT_REACHED).toContain('Delete one');
    expect(changeFailureMessage({ problem: 'limit-reached' }, 'save')).toBe(LIMIT_REACHED);
  });

  it('says that the entered values are kept when a save fails (PB-014)', () => {
    const message = changeFailureMessage(
      { problem: 'write-failed', reason: 'QUOTA_BYTES' },
      'save',
    );
    expect(message).toContain('still here');
    expect(message).toContain('Try again');
  });

  it('never shows the technical reason', () => {
    const failures = [
      changeFailureMessage({ problem: 'write-failed', reason: 'internal-detail' }, 'save'),
      changeFailureMessage({ problem: 'write-failed', reason: 'internal-detail' }, 'delete'),
      unreadableMessage({ status: 'corrupt', reason: 'internal-detail' }),
      unreadableMessage({ status: 'unavailable', reason: 'internal-detail' }),
    ];
    for (const message of failures) expect(message).not.toContain('internal-detail');
  });

  it('tells a failed save from a failed delete', () => {
    for (const failure of [
      { problem: 'not-found' },
      { problem: 'write-failed', reason: 'x' },
    ] as const) {
      expect(changeFailureMessage(failure, 'save')).not.toBe(
        changeFailureMessage(failure, 'delete'),
      );
    }
  });

  it('reuses the reading messages for data that cannot be read', () => {
    const cause = { status: 'unsupported-version', found: 2 } as const;
    expect(changeFailureMessage({ problem: 'unreadable', cause }, 'save')).toBe(
      unreadableMessage(cause),
    );
  });
});
