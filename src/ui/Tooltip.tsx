import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './tooltip.css';

/** How long the pointer rests on a control before its tip shows. */
const HOVER_DELAY_MS = 1000;

interface TooltipProps {
  text: string;
  /** Gets the id to put in the control's aria-describedby. */
  children: (describedBy: string) => ReactNode;
}

/**
 * A one-sentence explanation for a control. Shown when the pointer rests on it
 * or the keyboard focuses it, closed by Escape, and announced by screen
 * readers through aria-describedby. Unlike the title attribute, it also shows
 * for keyboard users and over a disabled button.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setShown(false);
  };

  return (
    <span
      className="tooltip"
      onMouseEnter={() => show(HOVER_DELAY_MS)}
      onMouseLeave={hide}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) show(0);
      }}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && shown) {
          event.stopPropagation();
          hide();
        }
      }}
      onClick={hide}
    >
      {children(id)}
      <span id={id} role="tooltip" className="tooltip__text" hidden={!shown}>
        {text}
      </span>
    </span>
  );
}
