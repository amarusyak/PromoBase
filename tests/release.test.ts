import { afterEach, describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';
import {
  exists,
  pathOf,
  removeRepo,
  tempRepo,
  zipEntries,
  zipText,
} from './support/release-repo.mjs';
import {
  manifestFiles,
  NOTICES,
  PAGES,
  packageProblems,
  packageRelease,
  versionFromTag,
} from '../tools/release.mjs';

// The release zip for the Chrome Web Store is made and checked by
// tools/release.mjs, which the release workflow runs on a tag (D-121).

describe('versionFromTag', () => {
  it.each([
    ['v0.1.0', '0.1.0'],
    ['v1.12.103', '1.12.103'],
  ])('%s is version %s', (tag, version) => {
    expect(versionFromTag(tag)).toBe(version);
  });

  it.each(['0.1.0', 'v0.1', 'v0.1.0-beta', 'v0.1.0 ', 'release-0.1.0', 'V0.1.0', ''])(
    '%j is not a release tag',
    (tag) => {
      expect(versionFromTag(tag)).toBeUndefined();
    },
  );
});

describe('manifestFiles', () => {
  it('names the icons, the popup and the service worker of the real manifest', () => {
    expect(manifestFiles(manifest)).toEqual([
      'icons/icon-128.png',
      'icons/icon-16.png',
      'icons/icon-32.png',
      'icons/icon-48.png',
      'popup.html',
      'service-worker.js',
    ]);
  });
});

const GOOD = [
  'manifest.json',
  NOTICES,
  'popup.html',
  'library.html',
  'service-worker.js',
  'assets/',
  'assets/popup-abc123.js',
  'icons/',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
];
const good = { entries: GOOD, manifest, version: manifest.version };

// Every .html page the source points to, and every page the build makes,
// must be one the zip check requires: named by the manifest or in PAGES.
const sources = import.meta.glob<string>('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const viteConfig = import.meta.glob<string>('../vite.config.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const htmlNames = (text: string) => [...text.matchAll(/['"]([\w-]+\.html)['"]/g)].map((m) => m[1]);

describe('pages the zip check requires', () => {
  const required = new Set([...manifestFiles(manifest), ...PAGES]);

  it('include the library, which the manifest does not name', () => {
    expect(PAGES).toContain('library.html');
    expect(manifestFiles(manifest)).not.toContain('library.html');
  });

  it('include every page the source opens or links to', () => {
    const named = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.ts'))
      .flatMap(([, text]) => htmlNames(text));
    expect(named).toContain('library.html');
    for (const page of named) expect(required, page).toContain(page);
  });

  it('include every page the build makes', () => {
    const built = htmlNames(Object.values(viteConfig)[0] ?? '');
    expect(built).toEqual(expect.arrayContaining(['popup.html', 'library.html']));
    for (const page of built) expect(required, page).toContain(page);
  });
});

describe('packageProblems', () => {
  it('finds nothing wrong with a complete package', () => {
    expect(packageProblems(good)).toEqual([]);
  });

  it('stops at a zip without manifest.json at its root', () => {
    expect(
      packageProblems({ ...good, entries: GOOD.map((e) => `dist/${e}`), manifest: undefined }),
    ).toEqual(['manifest.json is not at the root of the zip.']);
  });

  it('refuses a version other than the release', () => {
    expect(packageProblems({ ...good, version: '9.9.9' })).toEqual([
      `The manifest says version ${manifest.version}, the release is 9.9.9.`,
    ]);
  });

  it('names a file the manifest needs and the zip lacks', () => {
    const entries = GOOD.filter((e) => e !== 'icons/icon-48.png' && e !== 'popup.html');
    expect(packageProblems({ ...good, entries })).toEqual([
      'The manifest names icons/icon-48.png, which is not in the zip.',
      'The manifest names popup.html, which is not in the zip.',
    ]);
  });

  it('requires the library page, which the manifest does not name', () => {
    expect(packageProblems({ ...good, entries: GOOD.filter((e) => e !== 'library.html') })).toEqual(
      ['PromoBase opens library.html, which is not in the zip.'],
    );
  });

  it('requires the licence notices (D-122)', () => {
    expect(packageProblems({ ...good, entries: GOOD.filter((e) => e !== NOTICES) })).toEqual([
      `${NOTICES} is not in the zip (D-122).`,
    ]);
  });

  it('refuses source maps, hidden files and macOS folders', () => {
    const entries = [
      ...GOOD,
      'assets/popup-abc123.js.map',
      '.DS_Store',
      'icons/.keep',
      '__MACOSX/x',
    ];
    expect(packageProblems({ ...good, entries })).toEqual([
      '.DS_Store is a hidden or system file.',
      '__MACOSX/x is a hidden or system file.',
      'assets/popup-abc123.js.map is a source map.',
      'icons/.keep is a hidden or system file.',
    ]);
  });
});

describe('packageRelease', () => {
  let root = '';
  afterEach(() => removeRepo(root));

  /** A repository folder with package.json at `version` and a dist/ holding `files`. */
  function repo(version: string, files: Record<string, string>): string {
    root = tempRepo(version, files);
    return root;
  }

  const zipPath = () => pathOf(root, 'release', `promobase-${manifest.version}.zip`);

  const dist = (): Record<string, string> =>
    Object.fromEntries(
      GOOD.filter((e) => !e.endsWith('/')).map((e) => [
        e,
        e === 'manifest.json' ? JSON.stringify(manifest) : `synthetic ${e}`,
      ]),
    );

  it('zips dist/ with the manifest at the root and the files as built', () => {
    const zip = packageRelease(repo(manifest.version, dist()), `v${manifest.version}`);
    expect(zip).toBe(zipPath());
    const entries = zipEntries(zip);
    expect(entries).toContain('manifest.json');
    expect(entries).toContain('icons/icon-128.png');
    expect(entries.some((e) => e.startsWith('dist/'))).toBe(false);
    expect(zipText(zip, 'popup.html')).toBe('synthetic popup.html');
  });

  it('packages without a tag, for a dry run', () => {
    expect(packageRelease(repo(manifest.version, dist()))).toBe(zipPath());
  });

  it('refuses a tag that does not match package.json, before zipping', () => {
    expect(() => packageRelease(repo(manifest.version, dist()), 'v9.9.9')).toThrow(
      `The tag is v9.9.9, package.json says ${manifest.version}.`,
    );
    expect(exists(zipPath())).toBe(false);
  });

  it('refuses a tag that is not vX.Y.Z', () => {
    expect(() => packageRelease(repo(manifest.version, dist()), 'latest')).toThrow(
      'latest is not a release tag; it should be vX.Y.Z.',
    );
  });

  it('refuses to run before dist/ is built', () => {
    expect(() => packageRelease(repo(manifest.version, {}))).toThrow('dist/ has no manifest.json');
  });

  it('removes a zip that fails its checks', () => {
    const files = dist();
    files['assets/popup-abc123.js.map'] = '{}';
    expect(() => packageRelease(repo(manifest.version, files))).toThrow('is a source map');
    expect(exists(zipPath())).toBe(false);
  });
});
