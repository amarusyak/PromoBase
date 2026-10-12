/**
 * The toolbar icon highlight (D-061, D-064). A declarativeContent rule lets
 * Chrome swap the icon on pages of the given sites by itself. PromoBase needs
 * no access to those sites for it and never learns which page is open.
 */

const RULE_ID = 'promobase-highlight';
const YELLOW = '#ffdd33';
const NAVY = '#14213d';

/** The normal icon with its colours swapped: a yellow tile with a navy ticket. */
function highlightedIcon(size: number): ImageData {
  const context = new OffscreenCanvas(size, size).getContext('2d');
  if (context === null) throw new Error('2d canvas context unavailable');
  context.fillStyle = YELLOW;
  context.beginPath();
  context.roundRect(0, 0, size, size, size * 0.22);
  context.fill();
  const width = size * 0.7;
  const height = size * 0.42;
  const left = (size - width) / 2;
  const top = (size - height) / 2;
  context.fillStyle = NAVY;
  context.beginPath();
  context.roundRect(left, top, width, height, size * 0.06);
  context.fill();
  // The ticket's two bites, in the tile's colour.
  context.fillStyle = YELLOW;
  for (const x of [left, left + width]) {
    context.beginPath();
    context.arc(x, size / 2, height * 0.24, 0, Math.PI * 2);
    context.fill();
  }
  return context.getImageData(0, 0, size, size);
}

function whenDone(resolve: () => void, reject: (error: Error) => void) {
  return () => {
    const failure = chrome.runtime.lastError?.message;
    if (failure === undefined) resolve();
    else reject(new Error(failure));
  };
}

/**
 * Makes the icon change on exactly these domains and their subdomains,
 * replacing whatever was set before. An empty list removes the highlight.
 * Rejects when Chrome refuses the rule.
 */
export async function applyHighlight(domains: readonly string[]): Promise<void> {
  const events = chrome.declarativeContent.onPageChanged;
  // Without ids, every rule PromoBase ever registered goes, including any left
  // by an earlier build.
  await new Promise<void>((resolve, reject) => {
    events.removeRules(undefined, whenDone(resolve, reject));
  });
  if (domains.length === 0) return;
  const schemes = ['http', 'https'];
  const rule = {
    id: RULE_ID,
    conditions: domains.flatMap((domain) => [
      new chrome.declarativeContent.PageStateMatcher({ pageUrl: { hostEquals: domain, schemes } }),
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
  await new Promise<void>((resolve, reject) => {
    events.addRules([rule], whenDone(resolve, reject));
  });
}
