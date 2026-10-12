import { describe, expect, it } from 'vitest';

// The service worker wakes up for every event it listens to, so it must stay
// small: no Public Suffix List (about 300 kB) and no React (CLAUDE.md). This
// follows its imports through the source, the way the bundler will.
const sources = import.meta.glob<string>('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

function resolve(from: string, specifier: string): string | undefined {
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  const base = parts.join('/');
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((path) => path in sources);
}

/** Every source file and package that the module pulls in at run time. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const [, typeOnly, specifier] of (sources[file] ?? '').matchAll(IMPORT)) {
      if (typeOnly !== undefined || specifier === undefined) continue;
      if (!specifier.startsWith('.')) {
        seen.add(specifier.split('/')[0] ?? specifier);
        continue;
      }
      const target = resolve(file, specifier);
      if (target === undefined) throw new Error(`cannot resolve ${specifier} from ${file}`);
      queue.push(target);
    }
  }
  return seen;
}

describe('service worker imports', () => {
  const reachable = reachableFrom('../src/background/service-worker.ts');

  it.each(['tldts', 'react', 'react-dom', '../src/domain/derive-merchant-domain.ts'])(
    'does not pull in %s',
    (unwanted) => {
      expect([...reachable]).not.toContain(unwanted);
    },
  );

  it('does reach the modules it needs, so the walk itself works', () => {
    expect(reachable).toContain('../src/domain/site-codes.ts');
    expect(reachable).toContain('../src/data/load-state.ts');
  });

  it('would notice the suffix list behind the form validation', () => {
    const fromForm = reachableFrom('../src/domain/record-input.ts');
    expect(fromForm).toContain('tldts');
    expect(fromForm).toContain('../src/domain/derive-merchant-domain.ts');
  });
});
