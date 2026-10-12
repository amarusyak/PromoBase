import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Modules the service worker must never load, directly or through a shared chunk:
// React (UI only) and the Public Suffix List (about 300 kB).
const NOT_IN_SERVICE_WORKER = /node_modules[\\/](react|react-dom|scheduler|tldts[^\\/]*)[\\/]/;

// Fails the build when the service worker, or any chunk it imports, contains one of
// those modules. The import-graph test checks the source; this checks what the
// bundler made of it, since a shared chunk can pull in more than the source imports.
function serviceWorkerStaysSmall(): Plugin {
  return {
    name: 'promobase:service-worker-stays-small',
    generateBundle(_options, bundle) {
      const worker = bundle['service-worker.js'];
      if (worker?.type !== 'chunk') this.error('service-worker.js is missing from the build');
      const seen = new Set<string>();
      const visit = (fileName: string) => {
        if (seen.has(fileName)) return;
        seen.add(fileName);
        const chunk = bundle[fileName];
        if (chunk?.type !== 'chunk') return;
        const banned = chunk.moduleIds.find((id) => NOT_IN_SERVICE_WORKER.test(id));
        if (banned !== undefined) {
          this.error(`service worker loads ${fileName}, which contains ${banned}`);
        }
        chunk.imports.forEach(visit);
      };
      visit('service-worker.js');
    },
  };
}

// The extension has three entry points: two HTML pages and the background
// service worker. The manifest and icons are static files in public/.
export default defineConfig(({ mode }) => ({
  plugins: [react(), serviceWorkerStaysSmall()],
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
        // React goes into one chunk and the Public Suffix List into another (D-071).
        // Our own modules are split by the bundler by which entries use them, so the
        // ones the service worker shares with the pages land in a chunk without
        // either. Grouping src/ui here as well pulled its dependencies, the shared
        // domain modules included, into the React chunk.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
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
