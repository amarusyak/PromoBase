// Spike experiment for D-061: a reminder that needs no site access at all.
// chrome.declarativeContent matches page addresses inside the browser and swaps
// the toolbar icon, without ever telling the extension which page is open.
import { describeError } from './store';

const RULE_ID = 'spike-passive';

/** The normal icon with its colours swapped: yellow tile, navy ticket. */
function highlightedIcon(size: number): ImageData {
  const context = new OffscreenCanvas(size, size).getContext('2d');
  if (context === null) throw new Error('2d canvas context unavailable');
  const yellow = '#ffdd33';
  const navy = '#14213d';
  context.fillStyle = yellow;
  context.beginPath();
  context.roundRect(0, 0, size, size, size * 0.22);
  context.fill();
  const width = size * 0.7;
  const height = size * 0.42;
  const left = (size - width) / 2;
  const top = (size - height) / 2;
  context.fillStyle = navy;
  context.beginPath();
  context.roundRect(left, top, width, height, size * 0.06);
  context.fill();
  context.fillStyle = yellow;
  for (const x of [left, left + width]) {
    context.beginPath();
    context.arc(x, size / 2, height * 0.24, 0, Math.PI * 2);
    context.fill();
  }
  return context.getImageData(0, 0, size, size);
}

/**
 * Replaces the highlight rule so the icon changes on exactly these domains and
 * their subdomains. Resolves to an error message when Chrome refuses.
 */
export async function applyPassiveDomains(domains: string[]): Promise<string | undefined> {
  try {
    const rules = chrome.declarativeContent.onPageChanged;
    await new Promise<void>((resolve) => rules.removeRules([RULE_ID], () => resolve()));
    if (domains.length === 0) return undefined;
    const schemes = ['http', 'https'];
    const rule = {
      id: RULE_ID,
      conditions: domains.flatMap((domain) => [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: domain, schemes },
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostSuffix: `.${domain}`, schemes },
        }),
      ]),
      actions: [
        new chrome.declarativeContent.SetIcon({
          imageData: { 16: highlightedIcon(16), 32: highlightedIcon(32) },
        }),
      ],
    };
    await new Promise<void>((resolve, reject) =>
      rules.addRules([rule], () => {
        const failure = chrome.runtime.lastError?.message;
        if (failure === undefined) resolve();
        else reject(new Error(failure));
      }),
    );
    return undefined;
  } catch (error) {
    return describeError(error);
  }
}
