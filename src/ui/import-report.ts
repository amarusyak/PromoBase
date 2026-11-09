import type { ImportPlan } from '../domain/import';
import type { PromoCodeRecord } from '../domain/record';
import { merchantName } from './record-view';

/** How a skipped or flagged code is named: the code, and its site when it has one. */
function named(record: PromoCodeRecord): string {
  return record.merchantDomain === undefined
    ? record.promoCode
    : `${record.promoCode} (${merchantName(record.merchantDomain).name})`;
}

/** At most this many codes are named in one line; the rest are counted. */
const NAMED = 5;

function list(records: readonly PromoCodeRecord[]): string {
  const shown = records.slice(0, NAMED).map(named).join(', ');
  const more = records.length - NAMED;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

const codes = (n: number) => `${n} ${n === 1 ? 'code' : 'codes'}`;

export interface ImportReport {
  /** What was added. */
  summary: string;
  /** What needs the person's attention, one line each. Empty when nothing does. */
  warnings: string[];
}

/**
 * What an import did, said so that the person can act on it (owner's trial of
 * E1): nothing is skipped without being named.
 */
export function importReport(plan: ImportPlan): ImportReport {
  const warnings: string[] = [];
  if (plan.sameId.length > 0) {
    warnings.push(
      `${codes(plan.sameId.length)} already saved here, so the saved ${plan.sameId.length === 1 ? 'one was' : 'ones were'} kept and the file's skipped: ${list(plan.sameId)}.`,
    );
  }
  if (plan.overLimit.length > 0) {
    warnings.push(
      `${codes(plan.overLimit.length)} not added, because PromoBase keeps 100 codes at most: ${list(plan.overLimit)}. Delete codes you no longer need and import the file again.`,
    );
  }
  if (plan.lookAlike.length > 0) {
    warnings.push(
      `${codes(plan.lookAlike.length)} added that ${plan.lookAlike.length === 1 ? 'matches' : 'match'} a code already saved for the same site: ${list(plan.lookAlike)}. Delete any you do not need twice.`,
    );
  }
  const added = plan.added.length;
  return {
    summary: added === 0 ? 'No codes were added.' : `Added ${codes(added)}.`,
    warnings,
  };
}
