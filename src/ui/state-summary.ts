import type { LoadResult } from '../data/load-state';
import { RECORD_LIMIT, type PromoCodeRecord } from '../domain/record';
import { canSaveCopy, unreadableMessage } from './messages';

export type StateSummary =
  | {
      kind: 'ready';
      /** The saved records in stored order, oldest first. */
      records: PromoCodeRecord[];
      savedCount: number;
      capacityText: string;
      /** PB-003: no further record can be added. */
      atLimit: boolean;
    }
  /**
   * canSaveCopy: the stored value can be saved to a file as it is (D-124).
   * offerReport: the data is damaged, which only a fix to PromoBase can answer.
   */
  | { kind: 'problem'; message: string; canSaveCopy: boolean; offerReport: boolean };

/** Turns the outcome of loading stored data into what the interface shows. */
export function summarizeState(result: LoadResult): StateSummary {
  switch (result.status) {
    case 'empty':
      return ready([]);
    case 'ok':
      return ready(result.state.records);
    default:
      return {
        kind: 'problem',
        message: unreadableMessage(result),
        canSaveCopy: canSaveCopy(result),
        offerReport: result.status === 'corrupt',
      };
  }
}

function ready(records: PromoCodeRecord[]): StateSummary {
  return {
    kind: 'ready',
    records,
    savedCount: records.length,
    capacityText: `${records.length} of ${RECORD_LIMIT} codes saved`,
    atLimit: records.length >= RECORD_LIMIT,
  };
}
