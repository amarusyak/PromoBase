# PromoBase

Chrome Manifest V3 extension: TypeScript, React, Vite. Local-first, no backend.

## Sources of truth

Requirements (PB-xxx) are in the PRD, `docs/PromoBase_Product_Requirements_Document_v0.3.pdf`. Decisions (D-xxx) are in the working log, `claude/decisions.md` in the PromoBase project knowledge, and its published copy `docs/decisions.md`, which leaves out the Setup status section. A pull request that adds or changes a decision brings the copy up to date. Where the PRD and the log disagree, the log wins. Reference the IDs in commits, pull requests and test names where they apply.

## Commands

- `npm run check` - lint, type check, format check, unit tests, build. Run it before every commit.
- `npm test` - unit tests only.
- `npm run build` - production build into `dist/`, which is what gets loaded in Chrome.
- `npm run test:tools` - tests for `tools/draw-icons.py` (Python 3.8+ with Pillow; CI runs them too).
- `npm run test:browser` - the browser checks in `tests/browser`, against `dist/` in Chrome for Testing under a virtual display; see `tests/browser/README.md`. CI runs them on `main`, on a manual run and on pull requests labelled `browser-checks`.
- `npm run screenshots` - the Chrome Web Store screenshots, into `browser-output/store/` (D-117).

## Rules

- Logic lives in pure modules under `src/domain`: no `chrome.*`, and no reading the clock directly; take the current time as a parameter.
- Chrome APIs are called only from `src/platform`, behind small interfaces that tests can replace.
- Every logic module has unit tests next to it (`*.test.ts`). Test data is synthetic.
- A change to `public/manifest.json` needs a matching change in `tests/manifest.test.ts`. Request the narrowest permissions, and add one only in the change that first uses it.
- Site access is asked for one merchant domain at a time, as `*://*.<domain>/*`, only after PromoBase's own explanation, and from a click (the request is the last thing the click does). Whether it is held is always read from Chrome, never stored. The service worker gives back access no site needs; it never touches access in any other shape.
- A change to the shape of stored data follows the checklist in `CONTRIBUTING.md`: a `SCHEMA_VERSION` bump, a migration in `src/domain/stored-state.ts`, and new frozen fixtures. Frozen fixtures in `tests/fixtures` are never edited.
- Data that cannot be read is reported and left untouched, never repaired or overwritten.
- Saved records are changed only through `src/data/record-store.ts`, which holds the state lock for the whole read-change-write. Nothing else writes to the store.
- What a person may enter is checked in `src/domain/record-input.ts`. The read-side check in `stored-state.ts` stays limited to what the logic depends on, so a stricter entry rule never makes saved data unreadable.
- The service worker must not load the Public Suffix List (about 300 kB, pulled in by `src/domain/derive-merchant-domain.ts` and anything that imports it, such as `record-input` and `record-store`) or React. `tests/service-worker-imports.test.ts` checks the source, and `vite.config.ts` fails the build if the bundled worker loads either.
- When a visit opens the popup is decided in `src/domain/visit-reminder.ts`, a pure function of the visit state and what Chrome reports; `src/data/visit-reminders.ts` only reads, writes and carries out the effect, under one lock.
- React components stay thin. What they show is worked out in plain modules under `src/ui` (`messages`, `record-view`, `date-mask`, `draft`), which have unit tests; the components themselves are checked by driving the built extension in a browser (`tests/browser`). A change to what a page does comes with a browser check for it.
- Every sentence shown for a problem lives in `src/ui/messages.ts`, keyed by the reason codes of the logic.
- The popup must stay under Chrome's 600px height limit in its normal state.
- The extension makes no network requests and loads no remote fonts or scripts.
- Never commit secrets, signing keys or real promo codes.

## Workflow

- Work goes through pull requests, one work item each. `main` is not pushed to directly.
- A change with an interface is tried by the owner in Chrome before it is committed. A change without one goes straight to a pull request.
- Commits are authored as the repository owner, set per commit. The clone's git configuration is not edited.
- Commits and pull request descriptions carry no AI attribution: no Co-Authored-By or session trailers, no "Generated with" footers.
- TypeScript is pinned to 6.0.x because typescript-eslint does not support TypeScript 7 yet. Lift the pin when it does.
