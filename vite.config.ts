import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The extension has three entry points: two HTML pages and the background
// service worker. The manifest and icons are static files in public/.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    // Minimum supported Chrome, kept in step with minimum_chrome_version in the manifest.
    target: 'chrome127',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development',
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        popup: 'popup.html',
        library: 'library.html',
        'service-worker': 'src/background/service-worker.ts',
      },
      output: {
        // The manifest refers to the service worker by a fixed name at the extension root.
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        // React and the shared UI code go into one chunk that only the pages load, and
        // the Public Suffix List into another (D-071). Anything else is split by the
        // bundler, so the service worker never pulls in either.
        codeSplitting: {
          groups: [
            {
              name: 'ui',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]|src[\\/]ui[\\/]/,
            },
            { name: 'suffix-list', test: /node_modules[\\/]tldts[^\\/]*[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
}));
