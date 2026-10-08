import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import manifest from '../public/manifest.json';

// The manifest is the extension's contract with Chrome and with the user's
// trust. These tests make any change to it a deliberate, reviewed one.
describe('manifest', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('has the same version as package.json', () => {
    expect(manifest.version).toBe(packageJson.version);
  });

  it('requires Chrome 127, the first version with action.openPopup', () => {
    expect(manifest.minimum_chrome_version).toBe('127');
  });

  it('requests only the permissions the current build uses', () => {
    expect(manifest.permissions).toEqual(['storage']);
  });

  it('declares no site access and injects no scripts', () => {
    const keys = Object.keys(manifest);
    expect(keys).not.toContain('host_permissions');
    expect(keys).not.toContain('optional_host_permissions');
    expect(keys).not.toContain('optional_permissions');
    expect(keys).not.toContain('content_scripts');
  });

  it('opens the popup from the toolbar and runs a module service worker', () => {
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.background).toEqual({ service_worker: 'service-worker.js', type: 'module' });
  });

  it('keeps the store description within the 132 character limit', () => {
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });
});
