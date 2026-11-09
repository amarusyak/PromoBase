/** PB-002: where guest records live, what can remove them, and how to keep a copy (D-027). */
export const RETENTION_NOTICE =
  'Your promo codes are saved in this Chrome profile. Clearing browsing history will not remove them. ' +
  'If you remove PromoBase or reset or lose this Chrome profile, your saved codes may be lost. ' +
  'Keep a copy with Export in the library.';

/** PB-001: identifies the storage mode as guest and local. */
export const STORAGE_MODE = 'Guest mode. Codes stay in this Chrome profile.';

/** The same, for places with room for two words only. The retention notice there says where. */
export const STORAGE_MODE_SHORT = 'Guest mode';

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
