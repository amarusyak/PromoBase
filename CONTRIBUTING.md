# Contributing to PromoBase

Thanks for helping. PromoBase is small on purpose, so a few rules keep it that way.

## Workflow

- One pull request per change. `main` only changes by merging a reviewed pull request, and CI must be green.
- Run `npm run check` before every commit (lint, type check, format, unit tests, build). Changes to `tools/` also need `npm run test:tools`.
- A change to what the popup or library does comes with a browser check in `tests/browser` (see its README). Add the `browser-checks` label to the pull request to run them before merging; they also run on every push to `main`.
- Requirements (PB-xxx) and decisions (D-xxx) are in [`docs/`](docs/README.md). Mention the IDs a change implements in its commits, pull request and test names.
- Never commit secrets, signing keys or real promo codes. Test data is made up, and example sites use reserved names such as `example.org` or `shop.example`.

## Code layout

- Logic lives in pure modules under `src/domain`: no `chrome.*`, and the current time is passed in.
- Chrome is only called from `src/platform`, behind small interfaces that tests can replace.
- Every logic module has its unit tests next to it (`name.test.ts`). `tests/` holds checks that belong to no single module: the manifest, the service worker's imports, the store listing and images, and stored data compatibility.
- A new production dependency needs a licence file: the build writes `THIRD_PARTY_NOTICES.txt` into `dist/` from every bundled package and fails without one.
- Permissions: the narrowest that work, added only in the change that first uses them, with a matching change to `tests/manifest.test.ts`.

## Changing stored data

People keep their codes across updates, and an update can never ask them to start over. Anything that changes the shape of what PromoBase saves in `chrome.storage.local` (a field added, removed, renamed or given a new meaning, or a new top-level key) follows this checklist in the same pull request:

1. Increase `SCHEMA_VERSION` in `src/domain/stored-state.ts`.
2. Add a migration from the previous version in `parseStoredState`, with unit tests. A migration only reshapes data; it never drops a code.
3. Add the frozen files for the new layout: `tests/fixtures/stored-state-vN.json` and `tests/fixtures/export-vN.json`, using every field, and pin their SHA-256 in `tests/stored-data-compatibility.test.ts`. Update the pinned field list there.
4. Never edit an older frozen file. Each one is a promise that data saved by that version still loads.
5. Decide what an older build does with the new data, and note it in the pull request. Today an older build shows its "cannot read" notice and leaves the data untouched (D-042), so a rollback hides the codes until the fixed version ships, but loses nothing.

`tests/stored-data-compatibility.test.ts` enforces steps 1, 3 and 4: changing the record type without them fails the type check or the tests.

Data kept only for the browser session (`chrome.storage.session`: the popup draft and visit state) is cleared when PromoBase updates, so it needs no migration; it must still never break when it cannot be read.

## Icons and store images

Icons and the store tile are drawn by `tools/draw-icons.py`, so they carry no third-party art and no metadata. Every PNG in the repository is checked for metadata by `tests/store-listing.test.ts`.
