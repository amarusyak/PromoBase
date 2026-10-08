# PromoBase

A Chrome extension for saving promo codes - especially the ones you pick up from creators and online content - and getting reminded of them when you visit the merchant's site.

**Status:** pre-implementation. The repository currently holds the project bootstrap only; the extension skeleton lands next.

## What it does (first release)

- Save a promo code with the merchant's URL, an optional note, and optional start and expiry dates.
- Browse, search, edit and delete saved codes in a local library.
- Opt in per merchant to a reminder: when you visit that merchant's site, PromoBase shows the matching codes.

## Supported browser

Google Chrome desktop, version 127 or later (Manifest V3).

## Your data

- Records are stored locally in the browser profile (`chrome.storage.local`). There is no account and no server in the first release.
- Nothing is uploaded: no promo codes, notes, or visited URLs leave your machine.
- Site access is optional and requested per merchant, only for merchants you enable reminders for.
- Local-only storage means records are lost if the extension is removed or the browser profile is deleted.

## Development

Setup, build and test instructions will be added together with the extension skeleton.

Stack: TypeScript, Manifest V3, React with Vite.

## Reporting issues

Open an issue in this repository. Do not include real promo codes or personal data in reports - use made-up examples.

## License

[MIT](LICENSE)
