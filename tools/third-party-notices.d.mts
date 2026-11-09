import type { Plugin } from 'vite';

export interface PackageNotice {
  name: string;
  version: string;
  license: string;
  text: string;
}

export declare const NOTICES_FILE: string;
export declare function packageOf(moduleId: string): string | undefined;
export declare function readPackage(name: string, root?: string): PackageNotice;
export declare function noticesText(packages: readonly PackageNotice[]): string;
export declare function thirdPartyNotices(): Plugin;
