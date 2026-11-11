export interface ReleaseManifest {
  version?: string;
  icons?: Record<string, string>;
  action?: { default_popup?: string; default_icon?: Record<string, string> };
  background?: { service_worker?: string };
}

export declare const NOTICES: string;
export declare function versionFromTag(tag: string): string | undefined;
export declare function manifestFiles(manifest: ReleaseManifest): string[];
export declare function packageProblems(input: {
  entries: readonly string[];
  manifest: ReleaseManifest | undefined;
  version: string;
}): string[];
export declare function packageRelease(root: string, tag?: string): string;
