import { useEffect, useState, type ReactNode } from 'react';
import { BUILD_ID, BUILD_ID_REQUEST } from './build-id';
import { logEvent, type SpikeSource } from './log';
import { loadedManifestProblem } from './manifest-check';

/**
 * Replaces the spike controls with reload instructions while Chrome is running
 * an older manifest or an older service worker than the pages on disk.
 */
export function ManifestGuard({
  source,
  children,
}: {
  source: Extract<SpikeSource, 'popup' | 'library'>;
  children: ReactNode;
}) {
  const manifestProblem = loadedManifestProblem();
  // undefined while the worker has not answered yet, null when it gave no usable answer.
  const [workerBuild, setWorkerBuild] = useState<string | null>();

  useEffect(() => {
    let cancelled = false;
    chrome.runtime.sendMessage(BUILD_ID_REQUEST).then(
      (reply: unknown) => {
        if (!cancelled) setWorkerBuild(typeof reply === 'string' ? reply : null);
      },
      () => {
        if (!cancelled) setWorkerBuild(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const workerProblem =
    workerBuild === undefined || workerBuild === BUILD_ID
      ? undefined
      : 'the background worker comes from an older build than this page';
  const problem = manifestProblem ?? workerProblem;

  useEffect(() => {
    if (problem !== undefined) void logEvent(source, 'build:stale', { problem });
  }, [problem, source]);

  if (problem === undefined) {
    // Nothing is shown until the worker has answered, so the controls never flash.
    return manifestProblem === undefined && workerBuild === undefined ? null : children;
  }

  return (
    <section className="spike spike--blocked" role="alert">
      <h2>Reload needed</h2>
      <p>
        Chrome is still running an older copy of PromoBase, so nothing here would work. Open{' '}
        <code>chrome://extensions</code>, press the reload button on the PromoBase card, then open
        this again.
      </p>
      <p className="muted">What is out of date: {problem}.</p>
    </section>
  );
}
