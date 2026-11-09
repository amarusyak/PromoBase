import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import {
  bundledPackageDirs,
  noticesText,
  packageDir,
  readPackage,
  type PackageNotice,
} from '../tools/third-party-notices.mjs';

// The extension ships a licence notice for every third-party package bundled
// into it (PB-015, D-122). The plugin in tools/third-party-notices.mjs writes
// THIRD_PARTY_NOTICES.txt during the build and fails it when a notice is missing.

const LICENCES = 'tests/support/licences';

const notice = (name: string, extra: Partial<PackageNotice> = {}): PackageNotice => ({
  name,
  version: '1.0.0',
  license: 'MIT',
  text: `Licence text of ${name}`,
  ...extra,
});

describe('packageDir', () => {
  it.each([
    ['/repo/node_modules/react/cjs/react.production.js', '/repo/node_modules/react'],
    ['C:\\repo\\node_modules\\react-dom\\client.js', 'C:/repo/node_modules/react-dom'],
    ['/repo/node_modules/@scope/pkg/index.js', '/repo/node_modules/@scope/pkg'],
    ['/repo/node_modules/a/node_modules/b/index.js', '/repo/node_modules/a/node_modules/b'],
    ['\0/repo/node_modules/react/index.js?commonjs-proxy', '/repo/node_modules/react'],
    ['/repo/src/domain/record.ts', undefined],
    ['\0vite/modulepreload-polyfill', undefined],
    ['/repo/node_modules/', undefined],
    ['/repo/node_modules/@scope/', undefined],
  ])('%s comes from %s', (id, dir) => {
    expect(packageDir(id)).toBe(dir);
  });
});

describe('bundledPackageDirs', () => {
  it('keeps every package folder once, nested copies and other versions included', () => {
    expect(
      bundledPackageDirs([
        '/repo/node_modules/a/index.js',
        '/repo/node_modules/a/lib/more.js',
        '/repo/node_modules/b/node_modules/a/index.js',
        '/repo/src/main.tsx',
      ]),
    ).toEqual(['/repo/node_modules/a', '/repo/node_modules/b/node_modules/a']);
  });
});

describe('noticesText', () => {
  it('lists every package with its version, licence and text, sorted by name', () => {
    const text = noticesText([notice('zeta'), notice('alpha', { license: 'ISC' })]);
    expect(text).toContain('alpha 1.0.0 (ISC)\n\nLicence text of alpha');
    expect(text).toContain('zeta 1.0.0 (MIT)\n\nLicence text of zeta');
    expect(text.indexOf('alpha 1.0.0')).toBeLessThan(text.indexOf('zeta 1.0.0'));
  });

  it('gives each version of a package its own notice, and the same version only one', () => {
    const text = noticesText([
      notice('a', { version: '10.0.0', text: 'ten' }),
      notice('a', { version: '2.0.0', text: 'two' }),
      notice('a', { version: '2.0.0', text: 'two, nested copy' }),
    ]);
    expect(text.match(/^a 2\.0\.0 /gm)).toHaveLength(1);
    expect(text.match(/^a 10\.0\.0 /gm)).toHaveLength(1);
    expect(text.indexOf('a 2.0.0')).toBeLessThan(text.indexOf('a 10.0.0'));
  });

  it('adds the Public Suffix List notice with tldts, once, and only then', () => {
    const both = noticesText([notice('tldts'), notice('tldts', { version: '2.0.0' })]);
    expect(both.match(/Public Suffix List[^\n]*\(MPL-2\.0\)/g)).toHaveLength(1);
    expect(both).toContain('https://publicsuffix.org/list/');
    expect(noticesText([notice('react')])).not.toContain('Public Suffix List');
  });
});

describe('readPackage', () => {
  it.each(Object.keys(packageJson.dependencies))(
    'reads the licence of the production dependency %s from its folder',
    (name) => {
      const found = readPackage(`node_modules/${name}`);
      expect(found.name).toBe(name);
      expect(found.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(found.license).toBe('MIT');
      expect(found.text).toContain('Permission is hereby granted');
    },
  );

  it('reads name, version and licence from the folder it is given, not by name', () => {
    expect(readPackage(`${LICENCES}/two-versions-1`)).toMatchObject({
      name: 'two-versions',
      version: '1.0.0',
      text: 'Licence of two-versions 1.0.0',
    });
    expect(readPackage(`${LICENCES}/two-versions-2`)).toMatchObject({
      name: 'two-versions',
      version: '2.0.0',
      text: 'Licence of two-versions 2.0.0',
    });
  });

  it('fails clearly for a package with no licence file, or no package at all', () => {
    expect(() => readPackage(`${LICENCES}/no-licence`)).toThrow(
      /no-licence .* has no licence file/,
    );
    expect(() => readPackage(`${LICENCES}/not-there`)).toThrow();
  });
});
