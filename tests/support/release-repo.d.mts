export declare function tempRepo(version: string, files: Record<string, string>): string;
export declare function removeRepo(root: string): void;
export declare function pathOf(...parts: string[]): string;
export declare function exists(path: string): boolean;
export declare function zipEntries(zip: string): string[];
export declare function zipText(zip: string, path: string): string;
