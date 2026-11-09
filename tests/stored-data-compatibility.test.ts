import { describe, expect, it } from 'vitest';
import { parseImport } from '../src/domain/import';
import type { PromoCodeRecord } from '../src/domain/record';
import { SCHEMA_VERSION, parseStoredState } from '../src/domain/stored-state';

// Upgrade safety for saved data (D-023, D-042). People keep their codes across
// updates, so every layout a published build has written must stay readable:
//
// - The fields of version 1 are pinned below. Adding, removing or renaming a
//   field of PromoCodeRecord fails the type check here, on purpose.
// - tests/fixtures holds a frozen file for each layout ever written: what the
//   store holds (stored-state-vN.json) and what Export writes (export-vN.json).
//   Each one must still load, through the migrations in stored-state.ts.
// - Frozen files are pinned by hash and never edited. A new layout gets new
//   files, which in turn needs a SCHEMA_VERSION bump (one file per version).
//
// CONTRIBUTING.md has the checklist for changing stored data.

/** The record fields of layout version 1. */
const RECORD_FIELDS_V1 = [
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
] as const;

// Fails to compile when PromoCodeRecord no longer has exactly these fields.
// Then the layout has changed: see CONTRIBUTING.md before editing this list.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const recordLayoutUnchanged: Same<(typeof RECORD_FIELDS_V1)[number], keyof PromoCodeRecord> = true;

/** SHA-256 of each frozen file. A file is added here once, when its layout ships. */
const FROZEN: Record<string, string> = {
  'stored-state-v1.json': '4fd6e4b33c77b456c3270ebdde159e3ecc468d4716cc212a7524acbf455abdb5',
  'export-v1.json': 'b3e22d61b357ebd6385778f7ad88e7ef4604d7aa63da300e3ad38883730a51f5',
};

const fixtures = import.meta.glob<string>('./fixtures/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const file = (name: string) => fixtures[`./fixtures/${name}`];

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const versions = Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1);

describe('stored data compatibility', () => {
  it('pins the record fields of the current layout', () => {
    expect(recordLayoutUnchanged).toBe(true);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('has exactly one frozen state file and one export file for every layout', () => {
    const names = Object.keys(fixtures).map((path) => path.replace('./fixtures/', ''));
    const expected = versions.flatMap((v) => [`stored-state-v${v}.json`, `export-v${v}.json`]);
    expect(names.sort()).toEqual(expected.sort());
    expect(Object.keys(FROZEN).sort()).toEqual(expected.sort());
  });

  it.each(Object.keys(FROZEN))('%s has not been edited since it was frozen', async (name) => {
    expect(await sha256(file(name) ?? '')).toBe(FROZEN[name]);
  });

  it('the newest frozen state file uses every field, so it covers the whole layout', () => {
    const state = JSON.parse(file(`stored-state-v${SCHEMA_VERSION}.json`) ?? '{}') as {
      records: Record<string, unknown>[];
    };
    const used = new Set(state.records.flatMap((record) => Object.keys(record)));
    expect([...used].sort()).toEqual([...RECORD_FIELDS_V1].sort());
  });

  it.each(versions)('what a version %i build stored loads in this build', (version) => {
    const raw: unknown = JSON.parse(file(`stored-state-v${version}.json`) ?? 'null');
    const result = parseStoredState(raw);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.state.schemaVersion).toBe(SCHEMA_VERSION);
    const stored = (raw as { records: { id: string; promoCode: string }[] }).records;
    expect(result.state.records.map((r) => [r.id, r.promoCode])).toEqual(
      stored.map((r) => [r.id, r.promoCode]),
    );
    if (version === SCHEMA_VERSION) expect(result.state.records).toEqual(stored);
  });

  it.each(versions)('a file exported by a version %i build imports in this build', (version) => {
    const text = file(`export-v${version}.json`) ?? '';
    const result = parseImport(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const exported = (JSON.parse(text) as { records: { id: string }[] }).records;
    expect(result.records.map((r) => r.id)).toEqual(exported.map((r) => r.id));
  });
});
