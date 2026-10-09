// Replaced at build time (see vite.config.ts) with a value unique to each build.
// Chrome keeps running the old service worker until the extension is reloaded,
// while page files are read fresh from disk, so the two can come from different
// builds. Comparing this value on both sides makes that visible.
declare const __BUILD_ID__: string;

export const BUILD_ID = __BUILD_ID__;
export const BUILD_ID_REQUEST = 'spike:build-id';
