import { describe, expect, it } from 'vitest';
import { RETENTION_NOTICE, retentionNotice, STORAGE_MODE } from './copy';

describe('retentionNotice (PB-002, D-124)', () => {
  it('points to Export while the saved codes can be read', () => {
    expect(retentionNotice(true)).toBe(RETENTION_NOTICE);
    expect(retentionNotice(true)).toMatch(/Keep a copy with Export in the library\.$/);
  });

  it('leaves Export out while they cannot be read, keeping the rest word for word', () => {
    const notice = retentionNotice(false);
    expect(notice).not.toContain('Export');
    expect(RETENTION_NOTICE.startsWith(notice)).toBe(true);
    expect(notice).toMatch(/lose the profile\.$/);
  });
});

describe('the retention notice and storage line (PB-001, PB-002, D-128)', () => {
  it('says where codes live, what keeps them, what removes them, and how to keep a copy', () => {
    expect(RETENTION_NOTICE).toBe(
      'Your codes stay in this Chrome profile when you clear browsing history, ' +
        'but are lost if you remove PromoBase or reset or lose the profile. ' +
        'Keep a copy with Export in the library.',
    );
  });

  it('leaves "Guest mode" out of the interface while there is no other mode', () => {
    for (const text of [RETENTION_NOTICE, retentionNotice(false), STORAGE_MODE]) {
      expect(text).not.toMatch(/guest/i);
    }
    expect(STORAGE_MODE).toBe('Codes stay in this Chrome profile.');
  });
});
