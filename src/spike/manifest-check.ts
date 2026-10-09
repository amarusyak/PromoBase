import builtManifest from '../../public/manifest.json';

interface ManifestFacts {
  name: string;
  permissions?: readonly string[] | undefined;
  optional_host_permissions?: readonly string[] | undefined;
}

/**
 * Chrome reads the manifest only when the extension is loaded or reloaded, but
 * reads page files from disk every time. After a rebuild without a reload, new
 * pages therefore run against the old manifest. Returns what differs, if anything.
 */
export function describeManifestMismatch(
  built: ManifestFacts,
  loaded: ManifestFacts,
): string | undefined {
  const list = (values: readonly string[] | undefined) => [...(values ?? [])].sort().join(', ');
  if (built.name !== loaded.name) {
    return `name is "${loaded.name}", this build is "${built.name}"`;
  }
  if (list(built.permissions) !== list(loaded.permissions)) {
    return `permissions are [${list(loaded.permissions)}], this build needs [${list(built.permissions)}]`;
  }
  if (list(built.optional_host_permissions) !== list(loaded.optional_host_permissions)) {
    return `optional site access is [${list(loaded.optional_host_permissions)}], this build needs [${list(built.optional_host_permissions)}]`;
  }
  return undefined;
}

/** Undefined when the manifest Chrome has loaded matches this build. */
export function loadedManifestProblem(): string | undefined {
  return describeManifestMismatch(builtManifest, chrome.runtime.getManifest());
}
