# PromoBase

Chrome Manifest V3 extension: TypeScript, React, Vite. Local-first, no backend.

## Sources of truth

Requirements (PB-xxx) are in the PRD and decisions (D-xxx) in `claude/decisions.md`. Both live in the PromoBase project knowledge, not in this repository. Where they disagree, the decisions log wins. Reference the IDs in commits, pull requests and test names where they apply.

## Commands

- `npm run check` - lint, type check, format check, unit tests, build. Run it before every commit.
- `npm test` - unit tests only.
- `npm run build` - production build into `dist/`, which is what gets loaded in Chrome.

## Rules

- Logic lives in pure modules under `src/domain`: no `chrome.*`, and no reading the clock directly; take the current time as a parameter.
- Chrome APIs are called only from `src/platform`, behind small interfaces that tests can replace.
- Every logic module has unit tests next to it (`*.test.ts`). Test data is synthetic.
- A change to `public/manifest.json` needs a matching change in `tests/manifest.test.ts`. Request the narrowest permissions, and add one only in the change that first uses it.
- A change to the shape of stored data needs a `SCHEMA_VERSION` bump and a migration in `src/domain/stored-state.ts`.
- Data that cannot be read is reported and left untouched, never repaired or overwritten.
- Saved records are changed only through `src/data/record-store.ts`, which holds the state lock for the whole read-change-write. Nothing else writes to the store.
- What a person may enter is checked in `src/domain/record-input.ts`. The read-side check in `stored-state.ts` stays limited to what the logic depends on, so a stricter entry rule never makes saved data unreadable.
- The service worker must not import `src/domain/derive-merchant-domain.ts` or anything that imports it (`record-input`, `record-store`): that pulls in the Public Suffix List, about 300 kB.
- React components stay thin. What they show is worked out in plain modules under `src/ui` (`messages`, `record-view`, `date-mask`, `draft`), which have unit tests; the components themselves are checked by driving the built extension in a browser.
- Every sentence shown for a problem lives in `src/ui/messages.ts`, keyed by the reason codes of the logic.
- The popup must stay under Chrome's 600px height limit in its normal state.
- The extension makes no network requests and loads no remote fonts or scripts.
- Never commit secrets, signing keys or real promo codes.

## Workflow

- Work goes through pull requests, one work item each. `main` is not pushed to directly.
- A change with an interface is tried by the owner in Chrome before it is committed. A change without one goes straight to a pull request.
- Commits are authored as the repository owner, set per commit. The clone's git configuration is not edited.
- TypeScript is pinned to 6.0.x because typescript-eslint does not support TypeScript 7 yet. Lift the pin when it does.
