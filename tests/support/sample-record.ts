import type { PromoCodeRecord } from '../../src/domain/record';

/** A valid saved record with only the required fields. All values are made up. */
export function sampleRecord(overrides: Partial<PromoCodeRecord> = {}): PromoCodeRecord {
  return {
    id: '3f6c1d2e-0000-4000-8000-000000000001',
    promoCode: 'WELCOME10',
    notify: false,
    createdAt: '2026-10-08T12:00:00.000Z',
    updatedAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}
