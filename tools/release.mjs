// Packages a release of PromoBase for the Chrome Web Store (D-121).
//
//   node tools/release.mjs [vX.Y.Z]
//
// Zips the built dist/ into release/promobase-X.Y.Z.zip and checks the zip
// before anything is uploaded: the manifest at its root, the version equal to
// package.json and, when a tag is given, to the tag; every file the manifest
// names and every page PromoBase opens itself present; the licence notices
// included; no source maps, hidden files or folders from another system. Run after `npm run check`, which builds dist/.
// The release workflow (.github/workflows/release.yml) runs it on a tag.
//
// Exit codes: 0 packaged, 1 a check failed.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOTICES = 'THIRD_PARTY_NOTICES.txt';

// Pages the extension opens itself, which the manifest does not name: the
// library, from the welcome on install and from the popup's links.
// tests/release.test.ts keeps this list in step with the source and the build.
export const PAGES = ['library.html'];

/** The X.Y.Z of a release tag vX.Y.Z, or undefined for anything else. */
export function versionFromTag(tag) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  return match ? match[1] : undefined;
}

/** Every file a manifest names: icons, the popup, the service worker. */
export function manifestFiles(manifest) {
  const files = new Set();
  for (const path of Object.values(manifest.icons ?? {})) files.add(path);
  for (const path of Object.values(manifest.action?.default_icon ?? {})) files.add(path);
  if (manifest.action?.default_popup) files.add(manifest.action.default_popup);
  if (manifest.background?.service_worker) files.add(manifest.background.service_worker);
  return [...files].sort();
}

/**
 * What is wrong with a release zip, as sentences; empty when nothing is.
 * `entries` are the paths in the zip, `manifest` the parsed manifest.json from
 * it (undefined when missing), `version` the version the release should have.
 */
export function packageProblems({ entries, manifest, version }) {
  const problems = [];
  const files = new Set(entries.filter((entry) => !entry.endsWith('/')));
  if (!files.has('manifest.json') || manifest === undefined) {
    problems.push('manifest.json is not at the root of the zip.');
    return problems;
  }
  if (manifest.version !== version) {
    problems.push(`The manifest says version ${manifest.version}, the release is ${version}.`);
  }
  for (const path of manifestFiles(manifest)) {
    if (!files.has(path)) problems.push(`The manifest names ${path}, which is not in the zip.`);
  }
  for (const path of PAGES) {
    if (!files.has(path)) problems.push(`PromoBase opens ${path}, which is not in the zip.`);
  }
  if (!files.has(NOTICES)) problems.push(`${NOTICES} is not in the zip (D-122).`);
  for (const entry of [...files].sort()) {
    const parts = entry.split('/');
    if (entry.endsWith('.map')) problems.push(`${entry} is a source map.`);
    else if (parts.some((part) => part.startsWith('.') || part === '__MACOSX')) {
      problems.push(`${entry} is a hidden or system file.`);
    }
  }
  return problems;
}

/** Packages dist/ and checks the zip; returns its path or throws with every problem. */
export function packageRelease(root, tag) {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const problems = [];
  if (tag !== undefined) {
    const fromTag = versionFromTag(tag);
    if (fromTag === undefined) problems.push(`${tag} is not a release tag; it should be vX.Y.Z.`);
    else if (fromTag !== version) problems.push(`The tag is ${tag}, package.json says ${version}.`);
  }
  const dist = join(root, 'dist');
  if (!existsSync(join(dist, 'manifest.json')))
    problems.push('dist/ has no manifest.json; run npm run check first.');
  if (problems.length > 0) throw new Error(problems.join('\n'));

  const out = join(root, 'release');
  const zip = join(out, `promobase-${version}.zip`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  // -X leaves out extra file attributes, so the zip holds the files and nothing else.
  execFileSync('zip', ['-X', '-r', '-q', zip, '.'], { cwd: dist });

  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  let manifest;
  if (entries.includes('manifest.json')) {
    manifest = JSON.parse(
      execFileSync('unzip', ['-p', zip, 'manifest.json'], { encoding: 'utf8' }),
    );
  }
  const found = packageProblems({ entries, manifest, version });
  if (found.length > 0) {
    rmSync(out, { recursive: true, force: true });
    throw new Error(found.join('\n'));
  }
  return zip;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  try {
    const zip = packageRelease(root, process.argv[2]);
    console.log(
      `Packaged ${zip.slice(root.length + 1)} (${Math.round(statSync(zip).size / 1024)} kB).`,
    );
  } catch (error) {
    console.error(`Release not packaged:\n${error.message}`);
    process.exit(1);
  }
}
