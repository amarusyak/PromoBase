import type { Plugin } from 'vite';

export interface PackageNotice {
  name: string;
  version: string;
  license: string;
  text: string;
}

export declare const NOTICES_FILE: string;
export declare function packageDir(moduleId: string): string | undefined;
export declare function bundledPackageDirs(moduleIds: Iterable<string>): string[];
export declare function readPackage(dir: string): PackageNotice;
export declare function noticesText(packages: readonly PackageNotice[]): string;
export declare function thirdPartyNotices(): Plugin;
