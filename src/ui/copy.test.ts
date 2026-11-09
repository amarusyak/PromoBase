import { describe, expect, it } from 'vitest';
import { RETENTION_NOTICE, retentionNotice } from './copy';

describe('retentionNotice (PB-002, D-124)', () => {
  it('points to Export while the saved codes can be read', () => {
    expect(retentionNotice(true)).toBe(RETENTION_NOTICE);
    expect(retentionNotice(true)).toMatch(/Keep a copy with Export in the library\.$/);
  });

  it('leaves Export out while they cannot be read, keeping the rest word for word', () => {
    const notice = retentionNotice(false);
    expect(notice).not.toContain('Export');
    expect(RETENTION_NOTICE.startsWith(notice)).toBe(true);
    expect(notice).toContain('may be lost.');
  });
});
