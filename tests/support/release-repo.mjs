// File helpers for tests/release.test.ts, which runs without Node's types in
// the TypeScript project (D-126): a throwaway repository folder, and reading
// a zip with the system's unzip.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A new folder with package.json at `version` and dist/ holding `files` (path to text). */
export function tempRepo(version, files) {
  const root = mkdtempSync(join(tmpdir(), 'promobase-release-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, 'dist', path)), { recursive: true });
    writeFileSync(join(root, 'dist', path), text);
  }
  return root;
}

/** Removes a folder made by tempRepo. */
export function removeRepo(root) {
  if (root) rmSync(root, { recursive: true, force: true });
}

/** `parts` joined into a path. */
export const pathOf = (...parts) => join(...parts);

/** Whether a file exists. */
export const exists = (path) => existsSync(path);

/** The paths stored in a zip, in order. */
export function zipEntries(zip) {
  return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

/** The text of one file in a zip. */
export function zipText(zip, path) {
  return execFileSync('unzip', ['-p', zip, path], { encoding: 'utf8' });
}
