# PromoBase

A Chrome extension for saving promo codes - especially the ones you pick up from creators and online content - and getting reminded of them when you visit the merchant's site.

**Status:** early development. Codes can be saved from the popup and managed in the library. Reminders on the merchant's site are not built yet.

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

Requirements: Node.js 22.12 or later, npm, and Google Chrome 127 or later.

```sh
npm install
npm run build    # production build into dist/
npm run dev      # rebuild on every change
```

Load the build in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select the `dist/` folder.
3. Pin PromoBase from the extensions menu and click its toolbar icon.

After a rebuild, reopening the popup is enough to see popup changes. Changes to the manifest or the service worker need the reload button on the PromoBase card in `chrome://extensions`.

Checks:

```sh
npm run check    # lint, type check, format check, unit tests, build
npm test         # unit tests only
```

Stack: TypeScript, Manifest V3, React with Vite.

| Path             | Contents                                                  |
| ---------------- | --------------------------------------------------------- |
| `src/domain`     | Types and pure logic, no Chrome APIs                      |
| `src/platform`   | Thin adapters around Chrome APIs                          |
| `src/data`       | Reading stored state and changing saved records           |
| `src/ui`         | Code shared by the pages                                  |
| `src/popup`      | Toolbar popup                                             |
| `src/library`    | Full-page library                                         |
| `src/background` | Service worker                                            |
| `public`         | Manifest and icons, copied to `dist/` unchanged           |
| `tests`          | Checks that span the project, and helpers shared by tests |

## Reporting issues

Open an issue in this repository. Do not include real promo codes or personal data in reports - use made-up examples.

## License

[MIT](LICENSE)
