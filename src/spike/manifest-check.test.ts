import { describe, expect, it } from 'vitest';
import { describeManifestMismatch } from './manifest-check';

const spike = {
  name: 'PromoBase (spike)',
  permissions: ['storage', 'activeTab', 'scripting'],
  optional_host_permissions: ['*://*/*'],
};

describe('describeManifestMismatch', () => {
  it('finds nothing when the loaded manifest is this build', () => {
    expect(describeManifestMismatch(spike, { ...spike })).toBeUndefined();
  });

  it('ignores the order of permissions', () => {
    const reordered = { ...spike, permissions: ['scripting', 'storage', 'activeTab'] };
    expect(describeManifestMismatch(spike, reordered)).toBeUndefined();
  });

  it('reports the stage 1 manifest still being loaded', () => {
    const stage1 = { name: 'PromoBase', permissions: ['storage'] };
    expect(describeManifestMismatch(spike, stage1)).toContain('"PromoBase"');
  });

  it('reports missing permissions when only the name matches', () => {
    const loaded = { ...spike, permissions: ['storage'] };
    expect(describeManifestMismatch(spike, loaded)).toContain('has permissions [storage]');
  });

  it('reports missing optional site access', () => {
    const loaded = { name: spike.name, permissions: spike.permissions };
    expect(describeManifestMismatch(spike, loaded)).toContain('has optional site access []');
  });
});
