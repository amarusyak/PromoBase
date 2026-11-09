import { useEffect, useRef, useState } from 'react';
import { setSiteReminders } from '../data/record-store';
import { onSiteSwitched } from '../data/visit-reminders';
import { visitReminderDeps } from '../data/visit-reminders-deps';
import type { SiteReminderState } from '../domain/site-reminders';
import { chromeSiteAccess } from '../platform/site-access';
import { ACCESS_REQUEST_FAILED, switchFailureMessage } from './messages';
import { merchantName } from './record-view';
import {
  actionLabel,
  reminderExplanation,
  reminderActions,
  reminderStatus,
  type ReminderAction,
} from './reminder-view';
import { store } from './store';
import './site-reminder.css';

interface SiteReminderProps {
  /** The merchant domain as stored. */
  domain: string;
  state: SiteReminderState;
  /** One line, for a list row that names the site already (the library). */
  compact?: boolean;
  /** The popup was opened by a reminder for this site (D-005). */
  reminded?: boolean;
}

/**
 * A site's reminder switch (D-064, D-100). Turning it on first shows
 * PromoBase's own explanation; only "Turn on" there brings up Chrome's
 * dialog (D-061). The switch is saved before Chrome is asked, since Chrome's
 * dialog closes the popup (D-057).
 */
export function SiteReminder({
  domain,
  state,
  compact = false,
  reminded = false,
}: SiteReminderProps) {
  const site = merchantName(domain).name;
  const [explaining, setExplaining] = useState(false);
  const [failure, setFailure] = useState<string>();
  const busy = useRef(false);
  const explanation = useRef<HTMLDivElement>(null);
  const offer = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const acted = useRef(false);
  const showExplanation = explaining && state === 'off';

  useEffect(() => {
    if (showExplanation) explanation.current?.focus();
  }, [showExplanation]);

  // After the person's own action changed the state, the button they pressed is
  // gone. The focus goes to the line that says what happened, not to the next
  // button, so a second Enter cannot undo it.
  useEffect(() => {
    if (!acted.current) return;
    acted.current = false;
    if (state === 'off') offer.current?.focus();
    else status.current?.focus();
  }, [state]);

  // A click that comes while the previous one is still being saved is ignored (D-090).
  async function once(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    acted.current = true;
    setFailure(undefined);
    try {
      await work();
    } finally {
      busy.current = false;
    }
  }

  async function ask() {
    if ((await chromeSiteAccess.request(domain)) === 'failed') setFailure(ACCESS_REQUEST_FAILED);
  }

  const turnOn = () =>
    once(async () => {
      const switched = await setSiteReminders(store, domain, true);
      if (!switched.ok) {
        setFailure(switchFailureMessage(switched));
        return;
      }
      setExplaining(false);
      // Before Chrome is asked: its dialog may close the popup (D-057).
      await onSiteSwitched(visitReminderDeps(), domain);
      await ask();
    });

  const turnOff = () =>
    once(async () => {
      const switched = await setSiteReminders(store, domain, false);
      if (!switched.ok) setFailure(switchFailureMessage(switched));
      else await onSiteSwitched(visitReminderDeps(), domain);
    });

  const problem = failure !== undefined && (
    <p className="problem" role="alert">
      {failure}
    </p>
  );

  if (showExplanation) {
    const { title, paragraphs } = reminderExplanation(site);
    return (
      <div
        className="site-reminder site-reminder__explain"
        ref={explanation}
        tabIndex={-1}
        role="group"
        aria-labelledby={`reminder-${domain}`}
      >
        <h3 id={`reminder-${domain}`}>{title}</h3>
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="site-reminder__actions">
          <button className="button" type="button" onClick={() => void turnOn()}>
            Turn on
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setExplaining(false);
              requestAnimationFrame(() => offer.current?.focus());
            }}
          >
            Not now
          </button>
        </p>
        {problem}
      </div>
    );
  }

  const button = (action: ReminderAction) => {
    switch (action) {
      case 'offer':
        return (
          <button
            key={action}
            ref={offer}
            className={compact ? 'link' : 'button button--quiet'}
            type="button"
            onClick={() => setExplaining(true)}
          >
            {actionLabel(action, site)}
          </button>
        );
      case 'allow':
        return (
          <button key={action} className="button" type="button" onClick={() => void once(ask)}>
            {actionLabel(action, site)}
          </button>
        );
      case 'turn-off':
        return (
          <button
            key={action}
            className="link"
            type="button"
            aria-label={
              reminded ? `Don't remind me again on ${site}` : `Turn off reminders on ${site}`
            }
            onClick={() => void turnOff()}
          >
            {actionLabel(action, site, reminded)}
          </button>
        );
    }
  };

  return (
    <div
      className={`site-reminder site-reminder--${state}${compact ? ' site-reminder--compact' : ''}`}
    >
      <p className="site-reminder__actions">
        {state !== 'off' && (
          <span className="site-reminder__status" ref={status} tabIndex={-1}>
            {reminderStatus(state, site, compact)}
          </span>
        )}
        {reminderActions(state).map(button)}
      </p>
      {problem}
    </div>
  );
}
