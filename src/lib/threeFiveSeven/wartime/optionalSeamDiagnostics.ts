import { isWartimeCaptureEnabled } from './capture';

type SeamModule = typeof import('./h1r3ToH2r1');
type SourceSites = typeof import('./sourceSites');
type Modules = readonly [SeamModule, SourceSites];
type Scope = { gameId?: string | null; dealerGameId?: string | null };
type Diagnostic = (seam: SeamModule, sites: SourceSites) => void | Promise<void>;

/** Optional instrumentation must never reject into the gameplay error handler. */
export function createOptionalSeamDiagnostics(
  load: () => Promise<Modules>,
  enabled: (scope: Scope) => boolean,
) {
  let attempt: Promise<Modules | null> | undefined;
  let loadFailed = false;
  return (scope: Scope, diagnostic: Diagnostic): void => {
    try {
      if (loadFailed || !enabled(scope)) return;
      // One attempt for this page, including a rejected/missing old asset.
      // Catch before fan-out so concurrent render callers cannot retry it.
      attempt ??= Promise.resolve().then(load).catch(() => {
        loadFailed = true;
        return null;
      });
      void attempt.then(modules => {
        if (!modules || !enabled(scope)) return;
        return diagnostic(...modules);
      }).catch(() => { /* optional callback failure, never a gameplay failure */ });
    } catch { /* optional gate failure */ }
  };
}

export const withH1r3H2r1Diagnostics = createOptionalSeamDiagnostics(
  () => Promise.all([import('./h1r3ToH2r1'), import('./sourceSites')]),
  scope => isWartimeCaptureEnabled(scope.gameId, scope.dealerGameId),
);
