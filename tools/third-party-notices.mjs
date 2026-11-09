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

/** The npm package a bundled module belongs to, or undefined for our own code. */
export function packageOf(moduleId) {
  const parts = moduleId.replace(/\\/g, '/').split('/');
  const at = parts.lastIndexOf('node_modules');
  if (at === -1 || at + 1 >= parts.length) return undefined;
  const first = parts[at + 1];
  if (first === '') return undefined;
  if (first.startsWith('@')) return parts[at + 2] ? `${first}/${parts[at + 2]}` : undefined;
  return first;
}

/** Name, version, licence and licence text of an installed package. Throws when there is no text. */
export function readPackage(name, root = process.cwd()) {
  const folder = join(root, 'node_modules', name);
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
  const file = readdirSync(folder).find((entry) => LICENCE_FILE.test(entry));
  if (file === undefined) throw new Error(`${name} has no licence file to ship a notice from`);
  const text = readFileSync(join(folder, file), 'utf8').trim();
  if (text === '') throw new Error(`${name}'s licence file is empty`);
  return { name, version: manifest.version, license: manifest.license ?? 'see text', text };
}

/** The notices file: every package, sorted by name, then the data embedded in them. */
export function noticesText(packages) {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));
  const embedded = sorted.flatMap((p) => (EMBEDDED[p.name] ? [EMBEDDED[p.name]] : []));
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
      const names = new Set();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of output.moduleIds) {
          const name = packageOf(id);
          if (name !== undefined) names.add(name);
        }
      }
      let packages;
      try {
        packages = [...names].map((name) => readPackage(name));
      } catch (error) {
        this.error(
          `third-party notices: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: noticesText(packages) });
    },
  };
}
