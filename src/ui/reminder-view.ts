import type { SiteReminderState } from '../domain/site-reminders';

/** What a person can do about a site's reminders. */
export type ReminderAction = 'offer' | 'turn-off' | 'allow';

/** The buttons the reminder control offers for a site, in order (D-064, D-100). */
export function reminderActions(state: SiteReminderState): ReminderAction[] {
  switch (state) {
    case 'off':
      return ['offer'];
    case 'on':
      return ['turn-off'];
    case 'needs-access':
      return ['allow', 'turn-off'];
  }
}

/**
 * The line that says where a site's reminders stand. The short form is for a
 * list row, which already names the site above it.
 */
export function reminderStatus(
  state: Exclude<SiteReminderState, 'off'>,
  site: string,
  short = false,
): string {
  if (short) return state === 'on' ? 'Reminders on' : "Reminders wait for Chrome's permission";
  return state === 'on'
    ? `PromoBase opens by itself when you visit ${site}.`
    : `Reminders on ${site} are waiting for Chrome's permission.`;
}

/**
 * `reminded`: the popup was opened by a reminder, where turning reminders off
 * is offered as "Don't remind me again" (D-005). It does the same: turns the
 * site off (D-100).
 */
export function actionLabel(action: ReminderAction, site: string, reminded = false): string {
  switch (action) {
    case 'offer':
      return `Remind me on ${site}`;
    case 'turn-off':
      return reminded ? "Don't remind me again" : 'Turn off';
    case 'allow':
      return 'Allow access';
  }
}

/**
 * PromoBase's own explanation, shown before Chrome's dialog (PRD 7.1, D-061):
 * the site, why access is needed, and what happens if the person says no.
 * Chrome's own wording is quoted so its dialog does not come as a surprise.
 */
export function reminderExplanation(site: string): { title: string; paragraphs: string[] } {
  return {
    title: `Open PromoBase when you visit ${site}?`,
    paragraphs: [
      `It opens once per visit to ${site}. Chrome will ask to let PromoBase ` +
        `“read and change your data on all ${site} sites”: PromoBase uses this only to ` +
        `notice that a tab is on ${site}, puts nothing into the page and sends nothing anywhere.`,
      `If you say no, your codes stay saved and the icon still changes on ${site}. ` +
        'You can turn reminders off at any time.',
    ],
  };
}

/**
 * Several sites have reminders on but no access from Chrome, for example after
 * an import. One button asks for all of them in one Chrome dialog, after this
 * explanation (D-061).
 */
export function waitingSitesText(sites: readonly string[]): { text: string; action: string } {
  return {
    text:
      `Reminders are on for ${sites.length} sites that Chrome has not given PromoBase access to yet: ${sites.join(', ')}. ` +
      'Chrome will ask once for all of them. PromoBase uses the access only to notice that a tab is on one of these sites.',
    action: `Allow access for ${sites.length} sites`,
  };
}
