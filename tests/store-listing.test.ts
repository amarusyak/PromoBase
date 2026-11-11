import { describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';

// The store listing and the privacy policy describe this build to Chrome Web
// Store reviewers and to users (PRD 9.5, 10). These checks keep them in step
// with the manifest, and keep metadata out of the published images (D-098).
const text = import.meta.glob<string>(['../store/listing.md', '../PRIVACY.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const listing = text['../store/listing.md'] ?? '';
const privacy = text['../PRIVACY.md'] ?? '';

// Every PNG in the repository, not only the published ones: none may carry
// metadata such as C2PA Content Credentials (D-098). Folders git ignores are
// left out, so what is checked does not depend on what a local run left behind
// (browser-output/ holds the screenshots and captures of the browser checks).
const images = import.meta.glob<string>(
  [
    '../**/*.png',
    '!../node_modules/**',
    '!../dist/**',
    '!../build/**',
    '!../browser-output/**',
    '!../coverage/**',
    '!../playwright-report/**',
    '!../test-results/**',
    '!../.venv/**',
  ],
  { query: '?inline', import: 'default', eager: true },
);

function bytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Width, height and the chunk types of a PNG file. */
function png(data: Uint8Array): { width: number; height: number; chunks: string[] } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunks: string[] = [];
  for (let at = 8; at < data.length;) {
    const length = view.getUint32(at);
    chunks.push(String.fromCharCode(...data.slice(at + 4, at + 8)));
    at += 12 + length;
  }
  return { width: view.getUint32(16), height: view.getUint32(20), chunks };
}

describe('store listing', () => {
  it('uses the manifest description as its summary, within the store limit', () => {
    expect(listing).toContain(`> ${manifest.description}\n`);
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it('justifies every permission the manifest asks for, and only those', () => {
    const table = listing.slice(listing.indexOf('**Permission justifications:**'));
    const justified = [...table.matchAll(/^\| `([A-Za-z]+)`/gm)].map((m) => m[1]);
    expect(justified).toEqual(manifest.permissions);
    for (const pattern of manifest.optional_host_permissions) {
      expect(table).toContain(`Host permissions (\`${pattern}\`, optional)`);
    }
  });
});

describe('store listing version', () => {
  it('names the version it is for (RELEASING.md)', () => {
    expect(listing).toContain(`for PromoBase ${manifest.version}.`);
  });
});

describe('privacy policy', () => {
  it('names the version it applies to', () => {
    expect(privacy).toContain(`Applies to PromoBase ${manifest.version} for Google Chrome.`);
  });

  it('names every permission the manifest asks for', () => {
    for (const permission of manifest.permissions.filter((p) => p !== 'storage')) {
      expect(privacy).toContain(`\`${permission}\``);
    }
    expect(privacy).toContain('chrome.storage.local');
  });
});

describe('images', () => {
  const sizes: Record<string, [number, number]> = {
    '../public/icons/icon-16.png': [16, 16],
    '../public/icons/icon-32.png': [32, 32],
    '../public/icons/icon-48.png': [48, 48],
    '../public/icons/icon-128.png': [128, 128],
    '../store/promo-tile-440x280.png': [440, 280],
  };

  it('has every icon the manifest names', () => {
    for (const path of Object.values(manifest.icons)) {
      expect(Object.keys(images)).toContain(`../public/${path}`);
    }
  });

  it('found the images to check', () => {
    expect(Object.keys(images).length).toBeGreaterThanOrEqual(5);
  });

  it.each(Object.keys(images))('%s carries image data only, no metadata', (path) => {
    const { chunks } = png(bytes(images[path] ?? ''));
    expect(new Set(chunks)).toEqual(new Set(['IHDR', 'IDAT', 'IEND']));
  });

  it.each(
    Object.keys(images).filter((p) => p.startsWith('../public/') || p.startsWith('../store/')),
  )('%s has the size the store asks for', (path) => {
    const { width, height } = png(bytes(images[path] ?? ''));
    expect([width, height]).toEqual(sizes[path] ?? [1280, 800]);
  });

  it('has at most five screenshots, the store limit', () => {
    const shots = Object.keys(images).filter((p) => p.startsWith('../store/screenshot-'));
    expect(shots.length).toBeLessThanOrEqual(5);
  });
});
