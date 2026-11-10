# Browser checks

These checks drive the built extension in a real, headed Chrome, the way a person uses it: they type, click, answer Chrome's own permission dialog from the keyboard, and read the toolbar icon off the screen (D-054, D-088). Unit tests cover the logic; these cover what only exists in a browser.

| File                        | What it checks                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install.browser.mjs`       | The welcome on install, the pin hint, no second welcome on update (PB-001, D-113)                                                                                                                         |
| `records.browser.mjs`       | Saving, editing and deleting codes, the 100-code limit, saving from the popup (PB-003, PB-004, PB-009 to PB-011)                                                                                          |
| `reminders.browser.mjs`     | The toolbar highlight without site access, and the automatic reminder: Chrome's dialog, once per visit, the quiet period, background tabs, "Don't remind me again" (PB-007, D-001 to D-005, D-093, D-100) |
| `transfer.browser.mjs`      | Export and import: file format, refused files, the report, one dialog for several sites (D-106 to D-109)                                                                                                  |
| `unreadable.browser.mjs`    | Saved codes that cannot be read: the copy, nothing changed (D-042, D-124)                                                                                                                                 |
| `incognito.browser.mjs`     | PromoBase allowed in Incognito (D-123)                                                                                                                                                                    |
| `accessibility.browser.mjs` | axe-core in the main states, light and dark, and the popup's 600px limit (D-115, D-095)                                                                                                                   |

## Running them

They run in CI on every push to `main`, on a manual run, and on pull requests labelled `browser-checks` (D-125). To run them yourself you need:

- **Chrome for Testing or Chromium**, given as `PROMOBASE_CHROME`. Branded Google Chrome no longer loads an unpacked extension from the command line. CI uses Chrome for Testing 153.0.8010.12; to get the same build:

  ```sh
  npx @puppeteer/browsers@3.2.6 install chrome@153.0.8010.12
  ```

- **Linux with an X display**, usually a virtual one: `xvfb-run` (package `xvfb`) and `libxtst6`, which the checks use to press keys in Chrome's dialog.
- **Python 3 with Pillow** (`pip install -r tools/requirements.txt`), to read the toolbar from the screen.

```sh
npm run build
PROMOBASE_CHROME=/path/to/chrome xvfb-run -a -s "-screen 0 1280x1024x24" npm run test:browser
```

One file at a time: `node --test --test-reporter=spec tests/browser/reminders.browser.mjs`. Screenshots and downloads made along the way go to `browser-output/`, which git ignores; CI keeps it for 7 days when a check fails.

`PROMOBASE_DIST` points the checks at another build than `dist/`; `PROMOBASE_PYTHON` names another Python than `python3`.

## Writing one

- Act as a person would: `click` and `fill` from `support/actions.mjs` send real mouse and keyboard input. Set up data directly in storage when the check is about something else.
- Ask what is visible (`checkVisibility`), not what is in the page (D-097).
- Every site is made up: `.test` and `.example` names, served by `support/site.mjs` on this machine. Nothing leaves it.
- Each `describe` starts its own Chrome with a fresh profile, so files and groups do not depend on each other.

## Store screenshots

`npm run screenshots` makes the Chrome Web Store screenshots from the same build (D-117), into `browser-output/store/`. In CI it runs on a manual run with "Also make the Chrome Web Store screenshots" ticked, and the files are kept for 7 days as the `store-screenshots` artifact, to be checked and committed to `store/` by hand. It needs the Inter fonts (package `fonts-inter`) and a larger screen: `xvfb-run -a -s "-screen 0 2800x2000x24" npm run screenshots`.
