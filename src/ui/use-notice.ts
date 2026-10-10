import { useCallback, useEffect, useState } from 'react';

/** How long a notice such as "Deleted CLOUD25." stays on screen. */
export const NOTICE_SHOWN_FOR_MS = 10_000;

/**
 * A short confirmation of what was just done, which goes away by itself. It
 * only repeats what the list already shows, so nothing is lost when it goes.
 * Problems are not shown this way: they stay until the next action.
 *
 * Returns the text to show ("" when there is none) and a function that shows
 * a new one. Showing the same text again starts the time over.
 */
export function useNotice(): [text: string, show: (text: string) => void] {
  // A new object for every notice, so that a repeated text still restarts the timer.
  const [notice, setNotice] = useState({ text: '' });

  useEffect(() => {
    if (notice.text === '') return;
    const timer = setTimeout(() => setNotice({ text: '' }), NOTICE_SHOWN_FOR_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const show = useCallback((text: string) => setNotice({ text }), []);
  return [notice.text, show];
}
