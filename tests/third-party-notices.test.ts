import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import {
  noticesText,
  packageOf,
  readPackage,
  type PackageNotice,
} from '../tools/third-party-notices.mjs';

// The extension ships a licence notice for every third-party package bundled
// into it (PB-015, D-122). The plugin in tools/third-party-notices.mjs writes
// THIRD_PARTY_NOTICES.txt during the build and fails it when a notice is missing.

const notice = (name: string, extra: Partial<PackageNotice> = {}): PackageNotice => ({
  name,
  version: '1.0.0',
  license: 'MIT',
  text: `Licence text of ${name}`,
  ...extra,
});

describe('packageOf', () => {
  it.each([
    ['/repo/node_modules/react/cjs/react.production.js', 'react'],
    ['C:\\repo\\node_modules\\react-dom\\client.js', 'react-dom'],
    ['/repo/node_modules/@scope/pkg/index.js', '@scope/pkg'],
    ['/repo/node_modules/a/node_modules/b/index.js', 'b'],
    ['/repo/src/domain/record.ts', undefined],
    ['\0vite/modulepreload-polyfill', undefined],
    ['/repo/node_modules/', undefined],
  ])('%s belongs to %s', (id, name) => {
    expect(packageOf(id)).toBe(name);
  });
});

describe('noticesText', () => {
  it('lists every package with its version, licence and text, sorted by name', () => {
    const text = noticesText([notice('zeta'), notice('alpha', { license: 'ISC' })]);
    expect(text).toContain('alpha 1.0.0 (ISC)\n\nLicence text of alpha');
    expect(text).toContain('zeta 1.0.0 (MIT)\n\nLicence text of zeta');
    expect(text.indexOf('alpha 1.0.0')).toBeLessThan(text.indexOf('zeta 1.0.0'));
  });

  it('adds the Public Suffix List notice with tldts, and only then', () => {
    expect(noticesText([notice('tldts')])).toMatch(/Public Suffix List[^\n]*\(MPL-2\.0\)/);
    expect(noticesText([notice('tldts')])).toContain('https://publicsuffix.org/list/');
    expect(noticesText([notice('react')])).not.toContain('Public Suffix List');
  });
});

describe('readPackage', () => {
  it.each(Object.keys(packageJson.dependencies))(
    'finds the licence text of the production dependency %s',
    (name) => {
      const found = readPackage(name);
      expect(found.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(found.license).toBe('MIT');
      expect(found.text).toContain('Permission is hereby granted');
    },
  );

  it('fails clearly for a package that is not installed', () => {
    expect(() => readPackage('promobase-no-such-package')).toThrow();
  });
});
