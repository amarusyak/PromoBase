import { useEffect, useMemo, useState } from 'react';
import type { RecordInput } from '../domain/record-input';
import { chromeSessionStore } from '../platform/key-value-store';
import { DRAFT_KEY, EMPTY_INPUT, isBlankInput, parseDraft } from './draft';

export interface Draft {
  /** What the form starts with: the unfinished entry, or blank fields. */
  initial: RecordInput;
  /** True when `initial` is an unfinished entry from an earlier visit. */
  restored: boolean;
  remember: (input: RecordInput) => void;
  forget: () => void;
}

/**
 * Keeps the popup form's unsaved contents for the rest of the browser session.
 * Chrome closes the popup as soon as the page behind it is clicked, for
 * example to copy an address, and the entry would otherwise be lost.
 *
 * Undefined until the stored draft has been read. Keeping a draft is a
 * convenience: if session storage fails, the form simply starts blank.
 */
export function useDraft(): Draft | undefined {
  const store = useMemo(() => chromeSessionStore(), []);
  const [initial, setInitial] = useState<{ input: RecordInput; restored: boolean }>();

  useEffect(() => {
    let stopped = false;
    void store
      .get(DRAFT_KEY)
      .catch(() => undefined)
      .then((raw) => {
        if (stopped) return;
        const draft = parseDraft(raw);
        setInitial({ input: draft ?? EMPTY_INPUT, restored: draft !== undefined });
      });
    return () => {
      stopped = true;
    };
  }, [store]);

  return useMemo(() => {
    if (initial === undefined) return undefined;
    const ignore = () => undefined;
    return {
      initial: initial.input,
      restored: initial.restored,
      remember: (input) => {
        const write = isBlankInput(input) ? store.remove(DRAFT_KEY) : store.set(DRAFT_KEY, input);
        write.catch(ignore);
      },
      forget: () => {
        store.remove(DRAFT_KEY).catch(ignore);
      },
    };
  }, [initial, store]);
}
