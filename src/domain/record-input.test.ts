import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { NOTE_MAX_LENGTH, PROMO_CODE_MAX_LENGTH, RESOURCE_URL_MAX_LENGTH } from './record';
import {
  recordToInput,
  recordWarnings,
  validateRecordInput,
  type RecordFields,
  type RecordInput,
} from './record-input';

const TODAY = '2026-10-09';

function input(overrides: Partial<RecordInput> = {}): RecordInput {
  return {
    promoCode: 'WELCOME10',
    resourceUrl: '',
    merchantDomain: '',
    startDate: '',
    expiryDate: '',
    note: '',
    ...overrides,
  };
}

function fieldsOf(overrides: Partial<RecordInput> = {}): RecordFields {
  const result = validateRecordInput(input(overrides));
  if (!result.ok) throw new Error(`expected valid input, got ${JSON.stringify(result.errors)}`);
  return result.fields;
}

function errorsOf(overrides: Partial<RecordInput>) {
  const result = validateRecordInput(input(overrides));
  if (result.ok) throw new Error('expected a validation failure');
  return result.errors;
}

describe('validateRecordInput', () => {
  it('accepts a promo code on its own and leaves every optional field out (PB-004)', () => {
    // toStrictEqual also fails on a key that is present but undefined.
    expect(fieldsOf()).toStrictEqual({ promoCode: 'WELCOME10' });
  });

  it('turns a fully filled form into the stored form of each field', () => {
    expect(
      fieldsOf({
        promoCode: '  Cloud25 ',
        resourceUrl: ' https://www.dropbox.com/plans?ref=partner ',
        startDate: ' 01.10.2026 ',
        expiryDate: '31.12.2026',
        note: '  From the Tuesday newsletter\n',
      }),
    ).toStrictEqual({
      promoCode: 'Cloud25',
      resourceUrl: 'https://www.dropbox.com/plans?ref=partner',
      merchantDomain: 'dropbox.com',
      startDate: '2026-10-01',
      expiryDate: '2026-12-31',
      note: 'From the Tuesday newsletter',
    });
  });

  describe('promo code', () => {
    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['only tabs and line breaks', '\t\n'],
      ['only a non-breaking space', ' '],
    ])('is required: rejects %s', (_label, promoCode) => {
      expect(errorsOf({ promoCode })).toStrictEqual({ promoCode: 'required' });
    });

    it('keeps its case and the spaces inside it', () => {
      expect(fieldsOf({ promoCode: ' Save 10 Now ' }).promoCode).toBe('Save 10 Now');
    });

    it('may be exactly as long as the limit, measured after trimming', () => {
      const longest = 'C'.repeat(PROMO_CODE_MAX_LENGTH);
      expect(fieldsOf({ promoCode: `  ${longest}  ` }).promoCode).toBe(longest);
    });

    it('is rejected one character over the limit', () => {
      expect(errorsOf({ promoCode: 'C'.repeat(PROMO_CODE_MAX_LENGTH + 1) })).toStrictEqual({
        promoCode: 'too-long',
      });
    });
  });

  describe('address and merchant domain', () => {
    it.each([
      ['https://www.dropbox.com/plans', 'dropbox.com'],
      ['dropbox.com', 'dropbox.com'],
      ['Shop.Example.CO.UK/sale', 'example.co.uk'],
      ['http://mystore.myshopify.com:8080/', 'mystore.myshopify.com'],
    ])('keeps %s as typed and derives %s (PB-005)', (resourceUrl, merchantDomain) => {
      expect(fieldsOf({ resourceUrl })).toStrictEqual({
        promoCode: 'WELCOME10',
        resourceUrl,
        merchantDomain,
      });
    });

    it('treats a blank address as no address, not as a mistake (PB-014)', () => {
      expect(fieldsOf({ resourceUrl: '   ' })).toStrictEqual({ promoCode: 'WELCOME10' });
    });

    it.each([
      ['words', 'seen in a video', 'not-a-web-address'],
      ['a script link', 'javascript:alert(1)', 'unsupported-scheme'],
      ['a file link', 'file:///etc/hosts', 'unsupported-scheme'],
      ['an ftp link', 'ftp://example.com/codes', 'unsupported-scheme'],
      ['an email address', 'deals@example.com', 'has-user-part'],
      ['a name before an @', 'https://dropbox.com@evil.example/', 'has-user-part'],
      ['an IP address', 'http://192.168.0.1/shop', 'ip-address'],
      ['localhost', 'localhost:3000', 'local-name'],
      ['a suffix with no site name', 'co.uk', 'public-suffix'],
    ] as const)('rejects %s with its own reason', (_label, resourceUrl, problem) => {
      expect(errorsOf({ resourceUrl })).toStrictEqual({ resourceUrl: problem });
    });

    it('may be exactly as long as the limit', () => {
      const prefix = 'https://example.com/';
      const longest = prefix + 'p'.repeat(RESOURCE_URL_MAX_LENGTH - prefix.length);
      expect(longest).toHaveLength(RESOURCE_URL_MAX_LENGTH);
      expect(fieldsOf({ resourceUrl: longest })).toMatchObject({
        resourceUrl: longest,
        merchantDomain: 'example.com',
      });
    });

    it('is rejected one character over the limit', () => {
      const prefix = 'https://example.com/';
      const tooLong = prefix + 'p'.repeat(RESOURCE_URL_MAX_LENGTH - prefix.length + 1);
      expect(errorsOf({ resourceUrl: tooLong })).toStrictEqual({ resourceUrl: 'too-long' });
    });

    it('uses the corrected merchant domain instead of the derived one (D-017)', () => {
      expect(
        fieldsOf({ resourceUrl: 'https://short.example/abc123', merchantDomain: 'dropbox.com' }),
      ).toStrictEqual({
        promoCode: 'WELCOME10',
        resourceUrl: 'https://short.example/abc123',
        merchantDomain: 'dropbox.com',
      });
    });

    it('brings a corrected merchant domain into canonical form', () => {
      const fields = fieldsOf({
        resourceUrl: 'https://short.example/abc123',
        merchantDomain: ' HTTPS://WWW.Dropbox.com/plans ',
      });
      expect(fields.merchantDomain).toBe('dropbox.com');
    });

    it.each([
      ['words', 'the shoe shop', 'not-a-web-address'],
      ['an IP address', '10.0.0.1', 'ip-address'],
      ['a suffix with no site name', 'github.io', 'public-suffix'],
    ] as const)('rejects a correction that is %s', (_label, merchantDomain, problem) => {
      expect(
        errorsOf({ resourceUrl: 'https://short.example/abc123', merchantDomain }),
      ).toStrictEqual({ merchantDomain: problem });
    });

    it('rejects a corrected merchant domain when there is no address', () => {
      expect(errorsOf({ merchantDomain: 'dropbox.com' })).toStrictEqual({
        merchantDomain: 'needs-address',
      });
    });

    it('still checks the address when a correction is given', () => {
      expect(
        errorsOf({ resourceUrl: 'seen in a video', merchantDomain: 'dropbox.com' }),
      ).toStrictEqual({ resourceUrl: 'not-a-web-address' });
    });
  });

  describe('dates', () => {
    it('accepts a start date alone and an expiry date alone', () => {
      expect(fieldsOf({ startDate: '01.11.2026' })).toStrictEqual({
        promoCode: 'WELCOME10',
        startDate: '2026-11-01',
      });
      expect(fieldsOf({ expiryDate: '30.11.2026' })).toStrictEqual({
        promoCode: 'WELCOME10',
        expiryDate: '2026-11-30',
      });
    });

    it('accepts an expiry date that has already passed (D-020)', () => {
      expect(fieldsOf({ expiryDate: '01.01.2026' }).expiryDate).toBe('2026-01-01');
    });

    it('accepts a code that starts and ends on the same day', () => {
      expect(fieldsOf({ startDate: '09.10.2026', expiryDate: '09.10.2026' })).toMatchObject({
        startDate: '2026-10-09',
        expiryDate: '2026-10-09',
      });
    });

    it.each([
      ['one day', '10.10.2026', '09.10.2026'],
      ['across a month end, where comparing day numbers would mislead', '01.11.2026', '30.10.2026'],
      ['across a year end', '01.01.2027', '31.12.2026'],
    ])('rejects an expiry before the start by %s (PB-008)', (_label, startDate, expiryDate) => {
      expect(errorsOf({ startDate, expiryDate })).toStrictEqual({ expiryDate: 'before-start' });
    });

    it.each([
      ['2026-10-01', 'format'],
      ['1.10.2026', 'format'],
      ['31.02.2026', 'not-a-date'],
      ['01.01.1999', 'out-of-range'],
    ] as const)('reports %s on the field it was typed in as %s', (text, problem) => {
      expect(errorsOf({ startDate: text })).toStrictEqual({ startDate: problem });
      expect(errorsOf({ expiryDate: text })).toStrictEqual({ expiryDate: problem });
    });

    it('does not compare the dates when one of them is unreadable', () => {
      expect(errorsOf({ startDate: '31.12.2026', expiryDate: 'soon' })).toStrictEqual({
        expiryDate: 'format',
      });
    });
  });

  describe('note', () => {
    it('may be exactly as long as the limit, measured after trimming (PB-004)', () => {
      const longest = 'n'.repeat(NOTE_MAX_LENGTH);
      expect(fieldsOf({ note: ` ${longest}\n` }).note).toBe(longest);
    });

    it('is rejected one character over the limit', () => {
      expect(errorsOf({ note: 'n'.repeat(NOTE_MAX_LENGTH + 1) })).toStrictEqual({
        note: 'too-long',
      });
    });

    it('counts the way a text field does, so most emoji take two', () => {
      expect(fieldsOf({ note: '🎉'.repeat(NOTE_MAX_LENGTH / 2) }).note).toHaveLength(
        NOTE_MAX_LENGTH,
      );
      expect(errorsOf({ note: '🎉'.repeat(NOTE_MAX_LENGTH / 2) + '!' })).toStrictEqual({
        note: 'too-long',
      });
    });

    it('keeps line breaks inside the note', () => {
      expect(fieldsOf({ note: 'first line\nsecond line' }).note).toBe('first line\nsecond line');
    });

    it('leaves a blank note out', () => {
      expect(fieldsOf({ note: ' \n ' })).toStrictEqual({ promoCode: 'WELCOME10' });
    });
  });

  it('reports every field that needs correcting at once (PB-014)', () => {
    expect(
      errorsOf({
        promoCode: ' ',
        resourceUrl: 'deals@example.com',
        merchantDomain: 'the shoe shop',
        startDate: '32.01.2026',
        expiryDate: '2026',
        note: 'n'.repeat(NOTE_MAX_LENGTH + 1),
      }),
    ).toStrictEqual({
      promoCode: 'required',
      resourceUrl: 'has-user-part',
      merchantDomain: 'not-a-web-address',
      startDate: 'not-a-date',
      expiryDate: 'format',
      note: 'too-long',
    });
  });
});

describe('recordWarnings', () => {
  const saved = [
    sampleRecord({ id: 'a', promoCode: 'CLOUD25', merchantDomain: 'dropbox.com' }),
    sampleRecord({ id: 'b', promoCode: 'WELCOME10' }),
  ];

  it('has nothing to say about an ordinary new code', () => {
    expect(recordWarnings(fieldsOf({ promoCode: 'FRESH5' }), saved, TODAY)).toEqual([]);
  });

  it.each([
    ['the same code for the same merchant', 'CLOUD25', 'https://dropbox.com/'],
    ['the same code in another case', 'cloud25', 'www.dropbox.com/plans'],
    ['the same code with no merchant on either record', 'Welcome10', ''],
  ])('warns about a duplicate: %s (D-020)', (_label, promoCode, resourceUrl) => {
    expect(recordWarnings(fieldsOf({ promoCode, resourceUrl }), saved, TODAY)).toEqual([
      'duplicate',
    ]);
  });

  it.each([
    ['the same code for another merchant', 'CLOUD25', 'https://example.com/'],
    ['the same code when only the saved record has a merchant', 'CLOUD25', ''],
    ['the same code when only the new record has a merchant', 'WELCOME10', 'dropbox.com'],
    ['another code for the same merchant', 'CLOUD30', 'https://dropbox.com/'],
    ['a code that only starts the same way', 'CLOUD2', 'https://dropbox.com/'],
  ])('does not call it a duplicate: %s', (_label, promoCode, resourceUrl) => {
    expect(recordWarnings(fieldsOf({ promoCode, resourceUrl }), saved, TODAY)).toEqual([]);
  });

  it('does not report a record as a duplicate of itself while it is edited', () => {
    const fields = fieldsOf({ promoCode: 'CLOUD25', resourceUrl: 'dropbox.com' });
    expect(recordWarnings(fields, saved, TODAY, 'a')).toEqual([]);
    expect(recordWarnings(fields, saved, TODAY, 'b')).toEqual(['duplicate']);
  });

  it.each([
    ['yesterday', '08.10.2026', ['already-expired']],
    ['today', '09.10.2026', []],
    ['tomorrow', '10.10.2026', []],
  ])('for an expiry date of %s gives %j (D-020)', (_label, expiryDate, expected) => {
    expect(recordWarnings(fieldsOf({ promoCode: 'FRESH5', expiryDate }), saved, TODAY)).toEqual(
      expected,
    );
  });

  it('can give both warnings', () => {
    const fields = fieldsOf({ expiryDate: '01.01.2026' });
    expect(recordWarnings(fields, saved, TODAY)).toEqual(['duplicate', 'already-expired']);
  });
});

describe('recordToInput', () => {
  it('shows a record with only a code as a form with blank optional fields (PB-010)', () => {
    expect(recordToInput(sampleRecord())).toStrictEqual(input());
  });

  it('shows dates as DD.MM.YYYY and leaves the derived merchant domain blank', () => {
    const record = sampleRecord({
      promoCode: 'Cloud25',
      resourceUrl: 'https://www.dropbox.com/plans',
      merchantDomain: 'dropbox.com',
      startDate: '2026-10-01',
      expiryDate: '2026-12-31',
      note: 'From the Tuesday newsletter',
    });
    expect(recordToInput(record)).toStrictEqual({
      promoCode: 'Cloud25',
      resourceUrl: 'https://www.dropbox.com/plans',
      merchantDomain: '',
      startDate: '01.10.2026',
      expiryDate: '31.12.2026',
      note: 'From the Tuesday newsletter',
    });
  });

  it('fills in the merchant domain when it is not what the address gives (D-017)', () => {
    const record = sampleRecord({
      resourceUrl: 'https://short.example/abc123',
      merchantDomain: 'dropbox.com',
    });
    expect(recordToInput(record).merchantDomain).toBe('dropbox.com');
  });

  it.each([
    [{}],
    [{ resourceUrl: 'dropbox.com' }],
    [{ resourceUrl: 'https://short.example/abc123', merchantDomain: 'dropbox.com' }],
    [{ resourceUrl: 'https://xn--mnchen-3ya.de/', note: 'line one\nline two' }],
    [{ startDate: '01.10.2026', expiryDate: '31.12.2026' }],
    [{ promoCode: 'Save 10 Now', expiryDate: '29.02.2028', note: '🎉' }],
  ] as Partial<RecordInput>[][])(
    'opening a saved record and saving it unchanged keeps every field: %j',
    (typed) => {
      const fields = fieldsOf(typed);
      const reopened = recordToInput(sampleRecord(fields));
      expect(validateRecordInput(reopened)).toStrictEqual({ ok: true, fields });
    },
  );

  // These two stand in for a Public Suffix List update between the save and the
  // edit: the saved domain is neither what the address gives today nor a merchant
  // domain in its own right, so it is not a correction and is derived again.
  it.each([
    [
      'is now a shared suffix',
      'https://mystore.myshopify.com/',
      'myshopify.com',
      'mystore.myshopify.com',
    ],
    ['is now only a subdomain', 'https://shop.example.com/', 'shop.example.com', 'example.com'],
  ])(
    'derives the merchant domain again when the saved one %s',
    (_label, resourceUrl, merchantDomain, expected) => {
      const reopened = recordToInput(sampleRecord({ resourceUrl, merchantDomain }));
      expect(reopened.merchantDomain).toBe('');
      expect(validateRecordInput({ ...reopened, note: 'edited' })).toMatchObject({
        ok: true,
        fields: { merchantDomain: expected },
      });
    },
  );

  it('never reports the merchant domain of a record this build could have saved', () => {
    const saved = [
      fieldsOf({ resourceUrl: 'dropbox.com' }),
      fieldsOf({ resourceUrl: 'https://short.example/abc123', merchantDomain: 'dropbox.com' }),
      fieldsOf({ resourceUrl: 'https://a.b.example.co.uk/x', merchantDomain: 'www.example.org' }),
      fieldsOf(),
    ];
    for (const fields of saved) {
      const result = validateRecordInput(recordToInput(sampleRecord(fields)));
      expect(result).toStrictEqual({ ok: true, fields });
    }
  });
});
