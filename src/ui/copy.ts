/**
 * PB-002: where saved codes live and what can remove them. Four lines in the
 * popup with any common font, so its tallest normal state keeps room below
 * Chrome's 600px limit for wider fonts (D-127, D-128).
 */
const RETENTION_RISK =
  'Your codes stay in this Chrome profile when you clear browsing history, ' +
  'but are lost if you remove PromoBase or reset or lose the profile.';

/** PB-002, D-107, D-128: the same, with how to keep a copy (D-027). */
export const RETENTION_NOTICE = `${RETENTION_RISK} Keep a copy with Export in the library.`;

/**
 * While the saved codes cannot be read, Export is not available, so the notice
 * leaves it out; the problem itself offers a copy (D-124).
 */
export function retentionNotice(readable: boolean): string {
  return readable ? RETENTION_NOTICE : RETENTION_RISK;
}

/**
 * PB-001 as amended by D-128: says that codes are kept locally. "Guest mode"
 * stays out of the interface until accounts exist and it means something.
 */
export const STORAGE_MODE = 'Codes stay in this Chrome profile.';

/** Tips for the library's main buttons (owner's trial of E1): one sentence each. */
export const BUTTON_TIPS = {
  import: 'Add the codes from a file made with Export; codes you already have stay as they are.',
  export: 'Save all your codes to a file on this computer, to keep a copy or move them.',
  add: 'Save a new promo code, with its site, dates and a note if you like.',
} as const;

/**
 * PRD 13: PromoBase keeps codes, it does not test them. Said where codes are
 * kept and in the welcome, so nobody counts on a code because it is saved.
 */
export const NOT_CHECKED =
  'PromoBase does not check whether a code works; the shop decides that at checkout.';

/** PB-001: what an empty library says on first launch. */
export const WELCOME = {
  title: 'Welcome to PromoBase',
  intro: 'Keep the promo codes you come across, and find them again when you shop.',
  points: [
    'Save a code with the shop it belongs to, here or from the PromoBase button in the toolbar.',
    "On that shop's site, the PromoBase icon turns yellow and lists your codes.",
    'If you like, PromoBase can open by itself on a shop you choose. Chrome asks first.',
  ],
  importHint: 'Have an export from PromoBase? Use Import to bring your codes back.',
  pinHint:
    "Pin PromoBase to the toolbar to see its icon change: open Chrome's puzzle-piece Extensions menu and choose the pin next to PromoBase.",
} as const;

/** D-124: offered when the saved codes cannot be read. */
export const SAVE_COPY = {
  button: 'Save a copy of your saved codes',
  popupLink: 'Open the library to save a copy',
  issuesUrl: 'https://github.com/amarusyak/PromoBase/issues',
  issuesLink: 'Report the problem on GitHub',
} as const;
