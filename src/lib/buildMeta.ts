/**
 * Build metadata injected at compile time via Vite's define.
 *
 * Every cribbage (and future) debug event includes this so we can
 * determine which build was running when a trace was captured.
 */

declare const __BUILD_HASH__: string;
declare const __BUILD_TIMESTAMP__: string;

export const BUILD_META = {
  /** Short git commit SHA (or 'unknown' if unavailable) */
  commitSha: typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'unknown',
  /** ISO-8601 build timestamp */
  buildTimestamp: typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'unknown',
  /** Vite bundle identifier derived from import.meta.url */
  bundleId: (() => {
    try {
      // Extract the hashed chunk path from the running module
      const url = import.meta.url;
      const match = url.match(/\/assets\/[^?]+/);
      return match ? match[0] : url.slice(-60);
    } catch {
      return 'unknown';
    }
  })(),
  /** Hardcoded app version — bump on meaningful releases */
  appVersion: '1.0.0',
} as const;

/** Compact payload fragment to embed in every debug event */
export function buildMetaPayload(): Record<string, string> {
  return {
    _buildCommit: BUILD_META.commitSha,
    _buildTime: BUILD_META.buildTimestamp,
    _bundleId: BUILD_META.bundleId,
    _appVersion: BUILD_META.appVersion,
  };
}
