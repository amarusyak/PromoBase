import { chromeBrowserTabs } from '../platform/browser-tabs';
import { chromeLocalStore, chromeSessionStore } from '../platform/key-value-store';
import { webLock } from '../platform/lock';
import { REMINDER_LOCK, type ReminderDeps } from './visit-reminders';

/** The automatic reminder as it runs inside the extension. */
export function visitReminderDeps(): ReminderDeps {
  return {
    records: chromeLocalStore(),
    session: chromeSessionStore(),
    lock: webLock(REMINDER_LOCK),
    tabs: chromeBrowserTabs,
    now: () => new Date(),
  };
}
