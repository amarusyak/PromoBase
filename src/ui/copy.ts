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
