# Releasing PromoBase

How a version goes from `main` to the Chrome Web Store (D-121). The package is built and checked by CI; the upload to the store is done by hand, so no store credentials are kept anywhere in the repository or its workflows.

## 1. Get `main` ready

- Every pull request for the release is merged, and the last run on `main` is green: **CI** (check, tools) and **Browser checks**.
- Build `main` (`npm run check`), load `dist/` in Chrome and try the main paths by hand: add a code from the popup, see it on the shop's site, turn reminders on for a shop and visit it, export and import in the library, light and dark.

## 2. Set the version (a pull request)

Versions follow `MAJOR.MINOR.PATCH`. Chrome compares them as numbers, and the store refuses an upload whose version is not higher than the published one.

```sh
npm version 0.2.0 --no-git-tag-version   # package.json and package-lock.json
```

Then, in the same pull request:

- `public/manifest.json`: the same `version` (`tests/manifest.test.ts` keeps it equal to package.json).
- `PRIVACY.md`: "Applies to PromoBase X.Y.Z" and, when the policy changed, "Last updated" (`tests/store-listing.test.ts` checks the version).
- `store/listing.md`: the version in its first paragraph (checked by the same test), and any text that changed with the release.
- `README.md`: the status line, so it says what this version does.
- A change to stored data follows the checklist in `CONTRIBUTING.md` before anything else.

## 3. Tag the merged commit

After that pull request is merged, tag the merge commit on `main` and push the tag:

```sh
git switch main && git pull
git tag -a v0.2.0 -m "PromoBase 0.2.0"
git push origin v0.2.0
```

The tag must be `v` followed by the version in package.json. The **Release** workflow then runs on it: it refuses a tag that is not on `main` or does not match the version, runs `npm run check`, zips `dist/` and checks the zip (manifest at the root, the version, every file the manifest names, the licence notices, no source maps or hidden files). The zip is kept for 90 days on the run's page as `promobase-0.2.0.zip`.

A dry run of the same packaging, without a tag, runs on every pull request that changes the workflow or `tools/release.mjs`, can be started from the Actions tab on any branch (Release, Run workflow), or locally with `npm run check && node tools/release.mjs`.

## 4. Upload to the Chrome Web Store

1. Download `promobase-X.Y.Z.zip` from the Release run.
2. In the [developer dashboard](https://chrome.google.com/webstore/devconsole), open PromoBase, then **Package**, **Upload new package**, and choose the zip.
3. Check the **Store listing** and **Privacy practices** tabs against `store/listing.md`; the first release fills them in from it, with the icon, tile and screenshots it names.
4. **Submit for review**. Leave "publish automatically after review" on unless the release has to wait.

Rolling out to part of the users needs more than 10,000 weekly users, so a release goes to everyone at once: the testing in step 1 is the last chance to catch a problem.

## 5. After publishing

- Install the published version from the store in a clean Chrome profile and check that it opens, saves a code and shows it on the shop's site.
- From the second release on, check an update from the previous one with codes saved (D-119).

## If something goes wrong

- **The workflow fails on the tag:** fix the cause in a pull request, then delete the tag (`git push origin :refs/tags/vX.Y.Z` and `git tag -d vX.Y.Z`) and tag the new merge commit. Nothing has reached the store yet.
- **A published version is broken:** the dashboard's **Roll back to previous version** (Build, Package) republishes the previous version under a new, higher version number within a minute and without review ([Chrome's guide](https://developer.chrome.com/docs/webstore/rollback)); then publish the fix as the next version. If the broken version changed stored data, a rollback brings back a build that cannot read it (D-119): it shows the "cannot read" notice and changes nothing, so nothing is lost, but nobody can use their codes until the fix is out. Prefer a quick fixed version then.
- **After a rollback:** the next release needs a version higher than the number the rollback used.
