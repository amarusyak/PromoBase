import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  reminderActions,
  reminderExplanation,
  reminderStatus,
  waitingSitesText,
} from './reminder-view';

describe('reminderActions', () => {
  it('offers reminders while they are off', () => {
    expect(reminderActions('off')).toEqual(['offer']);
  });

  it('offers to turn them off while they are on', () => {
    expect(reminderActions('on')).toEqual(['turn-off']);
  });

  it('offers to ask Chrome again, or to turn them off, while access is missing (D-058)', () => {
    expect(reminderActions('needs-access')).toEqual(['allow', 'turn-off']);
  });
});

describe('texts', () => {
  it('names the site in the status and the offer', () => {
    expect(reminderStatus('on', 'example.org')).toBe(
      'PromoBase opens by itself when you visit example.org.',
    );
    expect(reminderStatus('needs-access', 'example.org')).toBe(
      "Reminders on example.org are waiting for Chrome's permission.",
    );
    expect(reminderStatus('on', 'example.org', true)).toBe('Reminders on');
    expect(reminderStatus('needs-access', 'example.org', true)).toBe(
      "Reminders wait for Chrome's permission",
    );
    expect(actionLabel('offer', 'example.org')).toBe('Remind me on example.org');
    expect(actionLabel('turn-off', 'example.org')).toBe('Turn off');
    expect(actionLabel('turn-off', 'example.org', true)).toBe("Don't remind me again");
    expect(actionLabel('offer', 'example.org', true)).toBe('Remind me on example.org');
    expect(actionLabel('allow', 'example.org')).toBe('Allow access');
  });

  it("explains the site, why access is needed, Chrome's wording and what a no means (PRD 7.1)", () => {
    const { title, paragraphs } = reminderExplanation('münchen.de');
    const text = paragraphs.join(' ');
    expect(title).toBe('Open PromoBase when you visit münchen.de?');
    expect(text).toContain('read and change your data on all münchen.de sites');
    expect(text).toContain('only to notice that a tab is on münchen.de');
    expect(paragraphs).toHaveLength(2);
    expect(text).toContain('If you say no, your codes stay saved');
    expect(text).toContain('turn reminders off at any time');
  });
});

describe('waitingSitesText', () => {
  it('names every waiting site, says Chrome asks once, and why access is needed', () => {
    const { text, action } = waitingSitesText(['a.example', 'münchen.de']);
    expect(text).toContain('Reminders are on for 2 sites');
    expect(text).toContain('a.example, münchen.de');
    expect(text).toContain('Chrome will ask once for all of them');
    expect(text).toContain('only to notice that a tab is on one of these sites');
    expect(action).toBe('Allow access for 2 sites');
  });
});
