import { useEffect, type ReactNode } from 'react';
import { logEvent, type SpikeSource } from './log';
import { loadedManifestProblem } from './manifest-check';

/** Replaces the spike controls with reload instructions while Chrome runs an older manifest. */
export function ManifestGuard({
  source,
  children,
}: {
  source: Extract<SpikeSource, 'popup' | 'library'>;
  children: ReactNode;
}) {
  const problem = loadedManifestProblem();

  useEffect(() => {
    if (problem !== undefined) void logEvent(source, 'manifest:stale', { problem });
  }, [problem, source]);

  if (problem === undefined) return children;

  return (
    <section className="spike spike--blocked" role="alert">
      <h2>Reload needed</h2>
      <p>
        Chrome is still running an older copy of PromoBase, so nothing here would work. Open{' '}
        <code>chrome://extensions</code>, press the reload button on the PromoBase card, then open
        this again.
      </p>
      <p className="muted">Loaded manifest: {problem}.</p>
    </section>
  );
}
