import type { LoadResult } from '../data/load-state';
import { RECORD_LIMIT } from '../domain/record';

export type StateSummary =
  | { kind: 'ready'; savedCount: number; capacityText: string }
  | { kind: 'problem'; message: string };

/** Turns the outcome of loading stored data into what the interface shows. */
export function summarizeState(result: LoadResult): StateSummary {
  switch (result.status) {
    case 'empty':
      return ready(0);
    case 'ok':
      return ready(result.state.records.length);
    case 'unsupported-version':
      return {
        kind: 'problem',
        message:
          'Your saved codes were written by a newer version of PromoBase. ' +
          'Update the extension to see them. Nothing has been changed.',
      };
    case 'corrupt':
      return {
        kind: 'problem',
        message: 'PromoBase could not read your saved codes. Nothing has been changed.',
      };
    case 'unavailable':
      return {
        kind: 'problem',
        message: 'Chrome storage is not responding. Close PromoBase and open it again.',
      };
  }
}

function ready(savedCount: number): StateSummary {
  return {
    kind: 'ready',
    savedCount,
    capacityText: `${savedCount} of ${RECORD_LIMIT} codes saved`,
  };
}
