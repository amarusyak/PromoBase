import { describe, expect, it } from 'vitest';
import { sampleRecord } from '../../tests/support/sample-record';
import { RECORD_LIMIT, type PromoCodeRecord } from '../domain/record';
import { recordToInput, type RecordInput } from '../domain/record-input';
import { SCHEMA_VERSION, STATE_KEY } from '../domain/stored-state';
import type { KeyValueStore } from '../platform/key-value-store';
import type { Lock } from '../platform/lock';
import { memoryStore } from '../platform/memory-store';
import { serialLock } from '../platform/serial-lock';
import { loadStoredState } from './load-state';
import { createRecord, deleteRecord, updateRecord, type RecordStoreDeps } from './record-store';

const FIRST_MOMENT = Date.UTC(2026, 9, 9, 12, 0, 0);

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

function stateWith(...records: PromoCodeRecord[]) {
  return { schemaVersion: SCHEMA_VERSION, records };
}

/** `count` saved records with ids saved-1, saved-2 and so on, oldest first. */
function savedRecords(count: number): PromoCodeRecord[] {
  return Array.from({ length: count }, (_, index) =>
    sampleRecord({ id: `saved-${index + 1}`, promoCode: `CODE${index + 1}` }),
  );
}

/**
 * A record store over in-memory storage. The clock moves one second on every
 * reading and ids count up from new-1, so every expected value is exact.
 */
function setup(initial?: unknown, overrides: Partial<RecordStoreDeps> = {}) {
  const inner = memoryStore(initial === undefined ? {} : { [STATE_KEY]: initial });
  const writes: unknown[] = [];
  const store: KeyValueStore = {
    get: (key) => inner.get(key),
    set: (key, value) => {
      writes.push(structuredClone(value));
      return inner.set(key, value);
    },
  };
  let clockReadings = 0;
  let idsHandedOut = 0;
  const deps: RecordStoreDeps = {
    store,
    lock: serialLock(),
    now: () => new Date(FIRST_MOMENT + 1000 * clockReadings++),
    newId: () => `new-${++idsHandedOut}`,
    ...overrides,
  };
  return {
    deps,
    /** Every value handed to storage, in order. */
    writes,
    /** The raw stored value, read past the store under test. */
    stored: () => inner.get(STATE_KEY),
    /** The saved records as the rest of the extension would load them. */
    records: async () => {
      const loaded = await loadStoredState(inner);
      if (loaded.status === 'empty') return [];
      if (loaded.status !== 'ok') throw new Error(`stored state is ${loaded.status}`);
      return loaded.state.records;
    },
  };
}

const moment = (secondsAfterFirst: number) =>
  new Date(FIRST_MOMENT + 1000 * secondsAfterFirst).toISOString();

const codes = (records: readonly PromoCodeRecord[]) => records.map((record) => record.promoCode);

describe('createRecord', () => {
  it('saves the first record on a fresh install', async () => {
    const { deps, stored } = setup();

    const result = await createRecord(deps, input());

    const expected = {
      id: 'new-1',
      promoCode: 'WELCOME10',
      notify: false,
      createdAt: moment(0),
      updatedAt: moment(0),
    };
    // toStrictEqual also fails on a key that is present but undefined (PRD 8.1).
    expect(result).toStrictEqual({ ok: true, record: expected });
    expect(await stored()).toStrictEqual({ schemaVersion: SCHEMA_VERSION, records: [expected] });
  });

  it('stores every field in its stored form (PB-004)', async () => {
    const { deps, records } = setup();

    await createRecord(
      deps,
      input({
        promoCode: ' Cloud25 ',
        resourceUrl: 'https://www.dropbox.com/plans',
        startDate: '01.10.2026',
        expiryDate: '31.12.2026',
        note: ' From the Tuesday newsletter ',
      }),
    );

    expect(await records()).toStrictEqual([
      {
        id: 'new-1',
        promoCode: 'Cloud25',
        resourceUrl: 'https://www.dropbox.com/plans',
        merchantDomain: 'dropbox.com',
        startDate: '2026-10-01',
        expiryDate: '2026-12-31',
        note: 'From the Tuesday newsletter',
        notify: false,
        createdAt: moment(0),
        updatedAt: moment(0),
      },
    ]);
  });

  it('adds the new record after the saved ones and leaves those unchanged', async () => {
    const saved = savedRecords(2);
    const { deps, records } = setup(stateWith(...saved));

    await createRecord(deps, input({ promoCode: 'THIRD' }));

    const after = await records();
    expect(after.slice(0, 2)).toStrictEqual(saved);
    expect(codes(after)).toEqual(['CODE1', 'CODE2', 'THIRD']);
  });

  it('gives each record its own id and creation time', async () => {
    const { deps, records } = setup();

    await createRecord(deps, input({ promoCode: 'FIRST' }));
    await createRecord(deps, input({ promoCode: 'SECOND' }));

    expect((await records()).map(({ id, createdAt }) => ({ id, createdAt }))).toEqual([
      { id: 'new-1', createdAt: moment(0) },
      { id: 'new-2', createdAt: moment(1) },
    ]);
  });

  it('leaves reminders off even when there is a merchant domain (D-064)', async () => {
    const { deps } = setup();
    const result = await createRecord(deps, input({ resourceUrl: 'dropbox.com' }));
    expect(result).toMatchObject({
      ok: true,
      record: { merchantDomain: 'dropbox.com', notify: false },
    });
  });

  it('allows a second record with the same code (D-020)', async () => {
    const { deps, records } = setup();
    await createRecord(deps, input());
    const second = await createRecord(deps, input());
    expect(second.ok).toBe(true);
    expect(await records()).toHaveLength(2);
  });

  it('reports what to correct and stores nothing when the input is invalid (PB-014)', async () => {
    const saved = stateWith(...savedRecords(1));
    const { deps, writes, stored } = setup(saved);

    const result = await createRecord(
      deps,
      input({ promoCode: '  ', expiryDate: '31.02.2026', resourceUrl: 'seen in a video' }),
    );

    expect(result).toStrictEqual({
      ok: false,
      problem: 'invalid',
      errors: {
        promoCode: 'required',
        resourceUrl: 'not-a-web-address',
        expiryDate: 'not-a-date',
      },
    });
    expect(writes).toEqual([]);
    expect(await stored()).toStrictEqual(saved);
  });

  describe('record limit (PB-003)', () => {
    it('saves the last record that fits and refuses the next one', async () => {
      const { deps, writes, records } = setup(stateWith(...savedRecords(RECORD_LIMIT - 1)));

      const lastThatFits = await createRecord(deps, input({ promoCode: 'FITS' }));
      expect(lastThatFits.ok).toBe(true);
      expect(await records()).toHaveLength(RECORD_LIMIT);

      const oneTooMany = await createRecord(deps, input({ promoCode: 'TOO-MANY' }));
      expect(oneTooMany).toStrictEqual({ ok: false, problem: 'limit-reached' });
      expect(writes).toHaveLength(1);
      expect(codes(await records())).not.toContain('TOO-MANY');
    });

    it('still allows editing at the limit', async () => {
      const { deps, records } = setup(stateWith(...savedRecords(RECORD_LIMIT)));

      const result = await updateRecord(deps, 'saved-1', input({ promoCode: 'EDITED' }));

      expect(result.ok).toBe(true);
      const after = await records();
      expect(after).toHaveLength(RECORD_LIMIT);
      expect(after[0]?.promoCode).toBe('EDITED');
    });

    it('frees one place when a record is deleted', async () => {
      const { deps, records } = setup(stateWith(...savedRecords(RECORD_LIMIT)));

      await deleteRecord(deps, 'saved-1');
      expect((await createRecord(deps, input({ promoCode: 'REPLACEMENT' }))).ok).toBe(true);
      expect(await createRecord(deps, input({ promoCode: 'TOO-MANY' }))).toMatchObject({
        problem: 'limit-reached',
      });
      expect(await records()).toHaveLength(RECORD_LIMIT);
    });

    it('keeps refusing until the count is back under the limit when storage holds more', async () => {
      const { deps, records } = setup(stateWith(...savedRecords(RECORD_LIMIT + 1)));

      expect(await createRecord(deps, input())).toMatchObject({ problem: 'limit-reached' });
      await deleteRecord(deps, 'saved-1');
      expect(await createRecord(deps, input())).toMatchObject({ problem: 'limit-reached' });
      await deleteRecord(deps, 'saved-2');
      expect((await createRecord(deps, input())).ok).toBe(true);
      expect(await records()).toHaveLength(RECORD_LIMIT);
    });

    it('reports invalid input before the limit, so the form can be corrected first', async () => {
      const { deps } = setup(stateWith(...savedRecords(RECORD_LIMIT)));
      expect(await createRecord(deps, input({ promoCode: '' }))).toMatchObject({
        problem: 'invalid',
      });
    });
  });
});

describe('updateRecord', () => {
  const original = sampleRecord({
    id: 'saved-2',
    promoCode: 'CLOUD25',
    resourceUrl: 'https://www.dropbox.com/plans',
    merchantDomain: 'dropbox.com',
    startDate: '2026-10-01',
    expiryDate: '2026-12-31',
    note: 'From the Tuesday newsletter',
  });
  const first = sampleRecord({ id: 'saved-1', promoCode: 'FIRST' });
  const third = sampleRecord({ id: 'saved-3', promoCode: 'THIRD' });

  it('replaces the editable fields and keeps the id, creation time and position (PB-010)', async () => {
    const { deps, records } = setup(stateWith(first, original, third));

    const result = await updateRecord(
      deps,
      'saved-2',
      input({
        promoCode: 'CLOUD30',
        resourceUrl: 'https://example.com/offer',
        startDate: '01.11.2026',
        expiryDate: '30.11.2026',
        note: 'New terms',
      }),
    );

    const expected = {
      id: 'saved-2',
      promoCode: 'CLOUD30',
      resourceUrl: 'https://example.com/offer',
      merchantDomain: 'example.com',
      startDate: '2026-11-01',
      expiryDate: '2026-11-30',
      note: 'New terms',
      notify: false,
      createdAt: original.createdAt,
      updatedAt: moment(0),
    };
    expect(result).toStrictEqual({ ok: true, record: expected, previous: original });
    expect(await records()).toStrictEqual([first, expected, third]);
  });

  it('removes optional fields that were cleared instead of storing them blank', async () => {
    const { deps, records } = setup(stateWith(original));

    await updateRecord(deps, 'saved-2', input({ promoCode: 'CLOUD25' }));

    expect(await records()).toStrictEqual([
      {
        id: 'saved-2',
        promoCode: 'CLOUD25',
        notify: false,
        createdAt: original.createdAt,
        updatedAt: moment(0),
      },
    ]);
  });

  it('moves the last-edited time forward on every save, also when nothing was changed', async () => {
    const { deps, records } = setup();
    await createRecord(deps, input());

    await updateRecord(deps, 'new-1', input());

    expect(await records()).toMatchObject([{ createdAt: moment(0), updatedAt: moment(1) }]);
  });

  it('applies the same checks as creating and stores nothing when they fail (PB-010)', async () => {
    const saved = stateWith(original);
    const { deps, writes, stored } = setup(saved);

    const result = await updateRecord(
      deps,
      'saved-2',
      input({ startDate: '10.10.2026', expiryDate: '09.10.2026' }),
    );

    expect(result).toStrictEqual({
      ok: false,
      problem: 'invalid',
      errors: { expiryDate: 'before-start' },
    });
    expect(writes).toEqual([]);
    expect(await stored()).toStrictEqual(saved);
  });

  it.each([
    ['an id that no record has', stateWith(first)],
    [
      'an id that only starts like a saved one',
      stateWith(sampleRecord({ id: 'missing-and-more' })),
    ],
    ['a fresh install', undefined],
    ['storage with no records left', stateWith()],
  ])('reports not found for %s and stores nothing', async (_label, initial) => {
    const { deps, writes, stored } = setup(initial);

    expect(await updateRecord(deps, 'missing', input())).toStrictEqual({
      ok: false,
      problem: 'not-found',
    });
    expect(writes).toEqual([]);
    expect(await stored()).toStrictEqual(initial);
  });

  describe('reminders', () => {
    const reminding = sampleRecord({
      id: 'saved-1',
      resourceUrl: 'https://www.dropbox.com/plans',
      merchantDomain: 'dropbox.com',
      notify: true,
    });

    it.each([
      ['nothing about the address changes', 'https://www.dropbox.com/plans', ''],
      ['the address changes but the merchant stays the same', 'dropbox.com/business', ''],
      ['the merchant is confirmed by hand', 'https://short.example/abc123', 'dropbox.com'],
    ])('stay on when %s', async (_label, resourceUrl, merchantDomain) => {
      const { deps } = setup(stateWith(reminding));
      const result = await updateRecord(deps, 'saved-1', input({ resourceUrl, merchantDomain }));
      expect(result).toMatchObject({
        ok: true,
        record: { merchantDomain: 'dropbox.com', notify: true },
      });
    });

    it('are switched off when the address is removed (PB-004)', async () => {
      const { deps, records } = setup(stateWith(reminding));

      const result = await updateRecord(deps, 'saved-1', input());

      expect(result).toMatchObject({ ok: true, previous: { notify: true } });
      expect(await records()).toMatchObject([{ notify: false }]);
      expect((await records())[0]).not.toHaveProperty('merchantDomain');
    });

    it.each([
      ['the address points to another merchant', 'https://example.com/offer', ''],
      ['the merchant is corrected to another one', 'https://www.dropbox.com/plans', 'example.com'],
    ])('are switched off when %s', async (_label, resourceUrl, merchantDomain) => {
      const { deps, records } = setup(stateWith(reminding));

      await updateRecord(deps, 'saved-1', input({ resourceUrl, merchantDomain }));

      expect(await records()).toMatchObject([{ merchantDomain: 'example.com', notify: false }]);
    });

    it('are never switched on by an edit', async () => {
      const quiet = sampleRecord({ id: 'saved-1' });
      const { deps, records } = setup(stateWith(quiet));

      await updateRecord(deps, 'saved-1', input({ resourceUrl: 'dropbox.com' }));

      expect(await records()).toMatchObject([{ merchantDomain: 'dropbox.com', notify: false }]);
    });
  });
});

describe('an edit that leaves the address and the merchant domain alone', () => {
  // Readable records whose saved merchant domain is not what the form would derive
  // today. Only the first two can come from the record store; the others stand for
  // a Public Suffix List update since the save, or for data no write path produces
  // (review of PR #4). All have reminders on, the thing an edit must not lose.
  const cases: [string, Partial<PromoCodeRecord>][] = [
    [
      'an ordinary record',
      { resourceUrl: 'https://www.dropbox.com/plans', merchantDomain: 'dropbox.com' },
    ],
    [
      'a corrected merchant',
      { resourceUrl: 'https://short.example/abc123', merchantDomain: 'dropbox.com' },
    ],
    [
      'a domain the list now reads as a subdomain',
      { resourceUrl: 'https://shop.example.com/', merchantDomain: 'shop.example.com' },
    ],
    [
      'a domain the list now reads as a shared suffix',
      { resourceUrl: 'https://mystore.myshopify.com/', merchantDomain: 'myshopify.com' },
    ],
    ['no address', { merchantDomain: 'dropbox.com' }],
    ['no address and a subdomain as the merchant', { merchantDomain: 'www.dropbox.com' }],
    ['no address and a shared suffix as the merchant', { merchantDomain: 'co.uk' }],
    ['a blank address', { resourceUrl: '', merchantDomain: 'dropbox.com' }],
  ];

  describe.each(cases)('%s', (_label, merchant) => {
    const saved = sampleRecord({ id: 'saved-1', notify: true, ...merchant });

    it('stores the record exactly as it was when nothing is changed', async () => {
      const { deps, records } = setup(stateWith(saved));

      const result = await updateRecord(deps, 'saved-1', recordToInput(saved));

      expect(result).toMatchObject({ ok: true });
      // Exact address, exact merchant domain, reminders still on, no key added or removed.
      expect(await records()).toStrictEqual([{ ...saved, updatedAt: moment(0) }]);
    });

    it('keeps address, merchant domain and reminders when another field is edited', async () => {
      const { deps, records } = setup(stateWith(saved));

      await updateRecord(deps, 'saved-1', {
        ...recordToInput(saved),
        promoCode: 'EDITED',
        expiryDate: '31.12.2026',
        note: 'edited',
      });

      expect(await records()).toStrictEqual([
        {
          ...saved,
          promoCode: 'EDITED',
          expiryDate: '2026-12-31',
          note: 'edited',
          updatedAt: moment(0),
        },
      ]);
    });
  });

  it('does not take spaces around the address for a change', async () => {
    const saved = sampleRecord({ id: 'saved-1', merchantDomain: 'www.dropbox.com', notify: true });
    const { deps, records } = setup(stateWith(saved));
    const opened = recordToInput(saved);

    await updateRecord(deps, 'saved-1', { ...opened, resourceUrl: `  ${opened.resourceUrl} ` });

    expect(await records()).toStrictEqual([{ ...saved, updatedAt: moment(0) }]);
  });

  it.each([
    [
      'the address',
      { resourceUrl: 'www.dropbox.com/plans' },
      { resourceUrl: 'www.dropbox.com/plans', merchantDomain: 'dropbox.com' },
    ],
    [
      'the merchant domain',
      { merchantDomain: 'example.com' },
      { resourceUrl: 'www.dropbox.com', merchantDomain: 'example.com' },
    ],
  ])(
    'derives the merchant again, and switches reminders off, once the user changes %s (D-075)',
    async (_label, change, expected) => {
      const saved = sampleRecord({
        id: 'saved-1',
        merchantDomain: 'www.dropbox.com',
        notify: true,
      });
      const { deps, records } = setup(stateWith(saved));

      await updateRecord(deps, 'saved-1', { ...recordToInput(saved), ...change });

      expect(await records()).toStrictEqual([
        { ...saved, ...expected, notify: false, updatedAt: moment(0) },
      ]);
    },
  );

  it('compares with the record as stored now, not as it was when the form was opened', async () => {
    // The form was opened on the first version; another tab then changed the address.
    const opened = sampleRecord({
      id: 'saved-1',
      resourceUrl: 'dropbox.com',
      merchantDomain: 'dropbox.com',
    });
    const changedElsewhere = {
      ...opened,
      resourceUrl: 'example.com',
      merchantDomain: 'example.com',
    };
    const { deps, records } = setup(stateWith(changedElsewhere));

    await updateRecord(deps, 'saved-1', { ...recordToInput(opened), note: 'from the stale form' });

    // The stale form differs from what is stored, so it counts as a change and wins as a whole.
    expect(await records()).toMatchObject([
      { resourceUrl: 'dropbox.com', merchantDomain: 'dropbox.com', note: 'from the stale form' },
    ]);
  });
});

describe('what a save with nothing changed rewrites', () => {
  // The rule in three parts, each pinned below (review of PR #4):
  // 1. A record this store saved changes in nothing but its last-edited time.
  // 2. The address and the merchant domain of any readable record are kept as
  //    stored (the describe block above).
  // 3. Every other field is written the way the entry checks give it. For a record
  //    no write path produces, the first save therefore tidies it, and from then
  //    on rule 1 holds.

  it.each<[string, Partial<RecordInput>]>([
    ['only a code', {}],
    [
      'every field',
      {
        promoCode: 'Cloud25',
        resourceUrl: 'https://www.dropbox.com/plans',
        startDate: '01.10.2026',
        expiryDate: '31.12.2026',
        note: 'From the Tuesday newsletter',
      },
    ],
    [
      'text that was typed with spaces around it',
      { promoCode: '  Save 10 Now ', note: '\tline one\nline two \n' },
    ],
    [
      'a corrected merchant',
      { resourceUrl: 'https://short.example/abc123', merchantDomain: 'www.dropbox.com' },
    ],
    ['an international name', { resourceUrl: 'https://www.münchen.de/', note: '🎉' }],
    ['an already expired code', { expiryDate: '29.02.2024' }],
  ])(
    'changes only the last-edited time of a record this store saved: %s',
    async (_label, typed) => {
      const { deps, records } = setup();
      const created = await createRecord(deps, input(typed));
      if (!created.ok) throw new Error(`expected the record to be created, got ${created.problem}`);

      await updateRecord(deps, 'new-1', recordToInput(created.record));

      expect(await records()).toStrictEqual([{ ...created.record, updatedAt: moment(1) }]);
    },
  );

  // Readable records that no write path produces, with what the first save makes of them.
  const untidy: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['spaces around the code', { promoCode: ' WELCOME10 ' }, { promoCode: 'WELCOME10' }],
    ['spaces around the note', { note: ' saved ' }, { note: 'saved' }],
    ['a line break after the note', { note: 'saved\n' }, { note: 'saved' }],
    ['an empty note', { note: '' }, {}],
    ['a note of spaces', { note: '   ' }, {}],
    ['a key this build does not know', { legacy: 'value' }, {}],
  ];

  describe.each(untidy)('a stored record with %s', (_label, odd, tidied) => {
    const base = sampleRecord({
      id: 'saved-1',
      // Not what the list derives today, and no address: part 2 of the rule applies too.
      merchantDomain: 'www.dropbox.com',
      notify: true,
    });
    const saved = { ...base, ...odd };
    const expected = { ...base, ...tidied };

    it('is readable and opens as a form that passes the checks', async () => {
      const { deps } = setup(stateWith(saved));
      expect(await loadStoredState(deps.store)).toMatchObject({ status: 'ok' });
      expect(await updateRecord(deps, 'saved-1', recordToInput(saved))).toMatchObject({ ok: true });
    });

    it('is tidied by the first save, with merchant domain and reminders kept', async () => {
      const { deps, records } = setup(stateWith(saved));

      await updateRecord(deps, 'saved-1', recordToInput(saved));

      expect(await records()).toStrictEqual([{ ...expected, updatedAt: moment(0) }]);
    });

    it('changes only its last-edited time on every save after that', async () => {
      const { deps, records } = setup(stateWith(saved));
      await updateRecord(deps, 'saved-1', recordToInput(saved));
      const [afterFirst] = await records();
      if (afterFirst === undefined) throw new Error('expected one record');

      await updateRecord(deps, 'saved-1', recordToInput(afterFirst));

      expect(await records()).toStrictEqual([{ ...afterFirst, updatedAt: moment(1) }]);
    });
  });

  it('leaves the untidy fields of other records alone', async () => {
    const untouched = {
      ...sampleRecord({ id: 'saved-1', promoCode: ' PADDED ', note: '' }),
      legacy: 'value',
    } as PromoCodeRecord;
    const { deps, stored } = setup(stateWith(untouched, sampleRecord({ id: 'saved-2' })));

    await createRecord(deps, input({ promoCode: 'NEW' }));
    await updateRecord(deps, 'saved-2', input({ promoCode: 'EDITED' }));
    await deleteRecord(deps, 'saved-2');

    expect(await stored()).toMatchObject({ records: [untouched, { promoCode: 'NEW' }] });
    expect(((await stored()) as { records: unknown[] }).records[0]).toStrictEqual(untouched);
  });
});

describe('deleteRecord', () => {
  it('removes that record only and reports which one it was (PB-011)', async () => {
    const [first, second, third] = savedRecords(3) as [
      PromoCodeRecord,
      PromoCodeRecord,
      PromoCodeRecord,
    ];
    const { deps, records } = setup(stateWith(first, second, third));

    const result = await deleteRecord(deps, 'saved-2');

    expect(result).toStrictEqual({ ok: true, record: second });
    expect(await records()).toStrictEqual([first, third]);
  });

  it('leaves readable, empty storage behind when the last record goes', async () => {
    const { deps, stored } = setup(stateWith(...savedRecords(1)));

    await deleteRecord(deps, 'saved-1');

    expect(await stored()).toStrictEqual({ schemaVersion: SCHEMA_VERSION, records: [] });
  });

  it.each([
    ['an id that no record has', stateWith(...savedRecords(2))],
    ['a fresh install', undefined],
  ])('reports not found for %s and stores nothing', async (_label, initial) => {
    const { deps, writes, stored } = setup(initial);

    expect(await deleteRecord(deps, 'missing')).toStrictEqual({ ok: false, problem: 'not-found' });
    expect(writes).toEqual([]);
    expect(await stored()).toStrictEqual(initial);
  });

  it('reports not found when the same record is deleted a second time', async () => {
    const { deps, writes, records } = setup(stateWith(...savedRecords(2)));

    expect((await deleteRecord(deps, 'saved-1')).ok).toBe(true);
    expect(await deleteRecord(deps, 'saved-1')).toMatchObject({ problem: 'not-found' });
    expect(writes).toHaveLength(1);
    expect(codes(await records())).toEqual(['CODE2']);
  });
});

describe('data that cannot be read (D-042)', () => {
  const unreadable = [
    [
      'written by a newer version',
      { schemaVersion: SCHEMA_VERSION + 1, records: [{ shape: 'unknown to this build' }] },
      'unsupported-version',
    ],
    ['not in a shape this build knows', { records: 'none' }, 'corrupt'],
    [
      'holding one broken record among good ones',
      stateWith(sampleRecord({ id: 'saved-1' }), sampleRecord({ id: 'saved-2', notify: true })),
      'corrupt',
    ],
  ] as const;

  const changes = [
    ['creating', (deps: RecordStoreDeps) => createRecord(deps, input())],
    ['updating', (deps: RecordStoreDeps) => updateRecord(deps, 'saved-1', input())],
    ['deleting', (deps: RecordStoreDeps) => deleteRecord(deps, 'saved-1')],
  ] as const;

  describe.each(unreadable)('storage %s', (_label, initial, status) => {
    it.each(changes)('is left exactly as it is when %s', async (_change, run) => {
      const { deps, writes, stored } = setup(initial);

      const result = await run(deps);

      expect(result).toMatchObject({ ok: false, problem: 'unreadable', cause: { status } });
      expect(writes).toEqual([]);
      expect(await stored()).toStrictEqual(initial);
    });
  });

  it.each(changes)('reports storage that does not answer when %s', async (_change, run) => {
    const attemptedWrites: unknown[] = [];
    const { deps } = setup(undefined, {
      store: {
        get: () => Promise.reject(new Error('storage is disabled')),
        set: (_key, value) => {
          attemptedWrites.push(value);
          return Promise.resolve();
        },
      },
    });

    expect(await run(deps)).toStrictEqual({
      ok: false,
      problem: 'unreadable',
      cause: { status: 'unavailable', reason: 'storage is disabled' },
    });
    expect(attemptedWrites).toEqual([]);
  });
});

describe('a write that fails (PB-014)', () => {
  /** Storage that reads normally and refuses every write. */
  function refusingWrites(initial: unknown, error: unknown) {
    const inner = memoryStore({ [STATE_KEY]: initial });
    const store: KeyValueStore = {
      get: (key) => inner.get(key),
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection is one of the cases under test
      set: () => Promise.reject(error),
    };
    return { store, stored: () => inner.get(STATE_KEY) };
  }

  const saved = stateWith(...savedRecords(2));

  it.each([
    ['creating', (deps: RecordStoreDeps) => createRecord(deps, input())],
    ['updating', (deps: RecordStoreDeps) => updateRecord(deps, 'saved-1', input())],
    ['deleting', (deps: RecordStoreDeps) => deleteRecord(deps, 'saved-1')],
  ] as const)('is reported, not thrown, when %s, and the saved data stays', async (_label, run) => {
    const { store, stored } = refusingWrites(saved, new Error('QUOTA_BYTES quota exceeded'));
    const { deps } = setup(undefined, { store });

    expect(await run(deps)).toStrictEqual({
      ok: false,
      problem: 'write-failed',
      reason: 'QUOTA_BYTES quota exceeded',
    });
    expect(await stored()).toStrictEqual(saved);
  });

  it('reports a rejection that is not an Error', async () => {
    const { store } = refusingWrites(saved, 'quota');
    const { deps } = setup(undefined, { store });
    expect(await createRecord(deps, input())).toStrictEqual({
      ok: false,
      problem: 'write-failed',
      reason: 'quota',
    });
  });

  it('reports a lock that cannot be taken and stores nothing', async () => {
    const lock: Lock = () => Promise.reject(new Error('locks are unavailable'));
    const { deps, writes } = setup(saved, { lock });

    expect(await deleteRecord(deps, 'saved-1')).toStrictEqual({
      ok: false,
      problem: 'write-failed',
      reason: 'locks are unavailable',
    });
    expect(writes).toEqual([]);
  });

  it('lets the next change through after a failed one', async () => {
    let refuse = true;
    const inner = memoryStore();
    const store: KeyValueStore = {
      get: (key) => inner.get(key),
      set: (key, value) => {
        if (refuse) return Promise.reject(new Error('try again'));
        return inner.set(key, value);
      },
    };
    const { deps } = setup(undefined, { store });

    expect(await createRecord(deps, input())).toMatchObject({ problem: 'write-failed' });
    refuse = false;
    expect((await createRecord(deps, input())).ok).toBe(true);
    expect(await loadStoredState(inner)).toMatchObject({ state: { records: [{ id: 'new-2' }] } });
  });

  it('refuses to store data that this build could not read back', async () => {
    // An id generator that repeats itself stands in for any bug that would
    // otherwise write a state the next read reports as corrupt.
    const saved = stateWith(sampleRecord({ id: 'taken' }));
    const { deps, writes, stored } = setup(saved, { newId: () => 'taken' });

    const result = await createRecord(deps, input());

    expect(result).toMatchObject({ ok: false, problem: 'write-failed' });
    expect(result).toHaveProperty('reason', expect.stringContaining('repeats an earlier id'));
    expect(writes).toEqual([]);
    expect(await stored()).toStrictEqual(saved);
  });
});

describe('changes made at the same moment (D-053)', () => {
  const CHANGES = 40;

  /** Storage that answers a moment later, as real extension storage does. */
  function slow(inner: KeyValueStore): KeyValueStore {
    const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    return {
      get: async (key) => {
        await later();
        return inner.get(key);
      },
      set: async (key, value) => {
        await later();
        return inner.set(key, value);
      },
    };
  }

  function createMany(deps: RecordStoreDeps) {
    return Promise.all(
      Array.from({ length: CHANGES }, (_, index) =>
        createRecord(deps, input({ promoCode: `CODE${index + 1}` })),
      ),
    );
  }

  it('keeps every record when they are all saved at once', async () => {
    const inner = memoryStore();
    const { deps } = setup(undefined, { store: slow(inner) });

    const results = await createMany(deps);

    expect(results.every((result) => result.ok)).toBe(true);
    const loaded = await loadStoredState(inner);
    const saved = loaded.status === 'ok' ? loaded.state.records : [];
    expect(saved).toHaveLength(CHANGES);
    expect(new Set(saved.map((record) => record.id)).size).toBe(CHANGES);
    expect(codes(saved)).toEqual(Array.from({ length: CHANGES }, (_, index) => `CODE${index + 1}`));
  });

  it('would lose records without the lock, which shows the test above can fail', async () => {
    const inner = memoryStore();
    const noLock: Lock = (work) => work();
    const { deps } = setup(undefined, { store: slow(inner), lock: noLock });

    const results = await createMany(deps);

    // Every call believes it succeeded, which is what makes this failure dangerous.
    expect(results.every((result) => result.ok)).toBe(true);
    const loaded = await loadStoredState(inner);
    expect(loaded.status === 'ok' && loaded.state.records.length).toBeLessThan(CHANGES);
  });

  it('applies mixed changes one after another', async () => {
    const inner = memoryStore({ [STATE_KEY]: stateWith(...savedRecords(3)) });
    const { deps } = setup(undefined, { store: slow(inner) });

    const results = await Promise.all([
      createRecord(deps, input({ promoCode: 'ADDED' })),
      deleteRecord(deps, 'saved-1'),
      updateRecord(deps, 'saved-2', input({ promoCode: 'EDITED' })),
      deleteRecord(deps, 'saved-1'),
      updateRecord(deps, 'saved-1', input({ promoCode: 'TOO-LATE' })),
    ]);

    expect(results.map((result) => (result.ok ? 'ok' : result.problem))).toEqual([
      'ok',
      'ok',
      'ok',
      'not-found',
      'not-found',
    ]);
    const loaded = await loadStoredState(inner);
    expect(loaded.status === 'ok' && codes(loaded.state.records)).toEqual([
      'EDITED',
      'CODE3',
      'ADDED',
    ]);
  });

  it('enforces the record limit when the last places are raced for', async () => {
    const inner = memoryStore({ [STATE_KEY]: stateWith(...savedRecords(RECORD_LIMIT - 2)) });
    const { deps } = setup(undefined, { store: slow(inner) });

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createRecord(deps, input({ promoCode: `RACE${index + 1}` })),
      ),
    );

    expect(results.map((result) => (result.ok ? 'ok' : result.problem))).toEqual([
      'ok',
      'ok',
      'limit-reached',
      'limit-reached',
      'limit-reached',
    ]);
    const loaded = await loadStoredState(inner);
    expect(loaded.status === 'ok' && loaded.state.records).toHaveLength(RECORD_LIMIT);
  });
});
