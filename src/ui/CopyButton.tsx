import { useEffect, useState } from 'react';
import { copyToClipboard } from '../platform/clipboard';

type CopyState = 'idle' | 'copied' | 'failed';

/** How long the outcome of a copy stays on screen. */
const SHOWN_FOR_MS = 2500;

interface CopyCodeProps {
  code: string;
}

/**
 * A promo code with a button that copies it (PB-012). The code itself can
 * always be selected by hand, which is the way out when copying is refused.
 */
export function CopyCode({ code }: CopyCodeProps) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), SHOWN_FOR_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    setState((await copyToClipboard(code)) ? 'copied' : 'failed');
  }

  return (
    <>
      <code className={state === 'copied' ? 'code code--copied' : 'code'}>{code}</code>
      <button
        className="button button--quiet"
        type="button"
        aria-label={`Copy code ${code}`}
        onClick={() => void copy()}
      >
        {state === 'copied' ? 'Copied' : 'Copy'}
      </button>
      <span className="copy-status" role="status">
        {state === 'failed' && 'Could not copy. Select the code and copy it by hand.'}
      </span>
    </>
  );
}
