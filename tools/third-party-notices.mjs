// Licence notices for the third-party code PromoBase ships (PB-015, D-122).
// A build plugin collects the packages the bundler actually put into dist/,
// reads each one's licence text and writes THIRD_PARTY_NOTICES.txt next to the
// manifest. The build fails when a bundled package has no licence text.
// Plain JavaScript so the Vite config can use Node's file system without
// bringing Node's types into the extension's own type check.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

/** Data compiled into a package under a licence of its own. */
const EMBEDDED = {
  tldts: {
    name: 'Public Suffix List (compiled into tldts)',
    license: 'MPL-2.0',
    text:
      'This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.\n' +
      'If a copy of the MPL was not distributed with this file, You can obtain one at\n' +
      'https://mozilla.org/MPL/2.0/.\n\n' +
      'PromoBase includes the list in the compiled form that tldts builds from it.\n' +
      'The list itself, in its source form, is published at https://publicsuffix.org/list/.',
  },
};

/**
 * The folder of the npm package a bundled module came from, as resolved by the
 * bundler, or undefined for our own code. Keeping the folder rather than just
 * the name means a nested copy, or a second version of a package, is read from
 * where it really is (review of PR #9).
 */
export function packageDir(moduleId) {
  const path = moduleId.replace(/^\0/, '').replace(/\?.*$/, '').replace(/\\/g, '/');
  const parts = path.split('/');
  const at = parts.lastIndexOf('node_modules');
  if (at === -1) return undefined;
  const first = parts[at + 1];
  if (!first) return undefined;
  const length = first.startsWith('@') ? 3 : 2;
  if (first.startsWith('@') && !parts[at + 2]) return undefined;
  return parts.slice(0, at + length).join('/');
}

/** Every package folder among the bundled modules, once each, sorted. */
export function bundledPackageDirs(moduleIds) {
  const dirs = new Set();
  for (const id of moduleIds) {
    const dir = packageDir(id);
    if (dir !== undefined) dirs.add(dir);
  }
  return [...dirs].sort();
}

/** Name, version, licence and licence text of the package in `dir`. Throws when there is no text. */
export function readPackage(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const name = manifest.name ?? dir;
  const file = readdirSync(dir).find((entry) => LICENCE_FILE.test(entry));
  if (file === undefined)
    throw new Error(`${name} (${dir}) has no licence file to ship a notice from`);
  const text = readFileSync(join(dir, file), 'utf8').trim();
  if (text === '') throw new Error(`${name} (${dir}) has an empty licence file`);
  return { name, version: manifest.version, license: manifest.license ?? 'see text', text };
}

/**
 * The notices file: one section per package version, sorted by name and
 * version (two copies of the same version count once), then the data
 * embedded in them.
 */
export function noticesText(packages) {
  const unique = new Map();
  for (const p of packages) {
    const key = `${p.name}@${p.version}`;
    if (!unique.has(key)) unique.set(key, p);
  }
  const sorted = [...unique.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version, 'en', { numeric: true }),
  );
  const embedded = [...new Set(sorted.map((p) => p.name))].flatMap((name) =>
    EMBEDDED[name] ? [EMBEDDED[name]] : [],
  );
  const rule = '-'.repeat(72);
  const sections = [
    ...sorted.map((p) => `${p.name} ${p.version} (${p.license})\n\n${p.text}`),
    ...embedded.map((e) => `${e.name} (${e.license})\n\n${e.text}`),
  ];
  return (
    'PromoBase includes the following third-party software.\n' +
    'PromoBase itself is MIT-licensed: https://github.com/amarusyak/PromoBase\n\n' +
    sections.map((section) => `${rule}\n${section}\n`).join('\n')
  );
}

/** Vite plugin: writes the notices for whatever ends up in the bundle. */
export function thirdPartyNotices() {
  return {
    name: 'promobase:third-party-notices',
    generateBundle(_options, bundle) {
      const moduleIds = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' ? output.moduleIds : [],
      );
      let packages;
      try {
        packages = bundledPackageDirs(moduleIds).map((dir) => readPackage(dir));
      } catch (error) {
        this.error(
          `third-party notices: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: noticesText(packages) });
    },
  };
}
