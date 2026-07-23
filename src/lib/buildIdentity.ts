/**
 * Release integrity — runtime build identity.
 *
 * Values are injected at compile time by vite.config.ts. Production
 * builds fail if the full 40-char Git SHA cannot be resolved, so at
 * runtime BUILD_IDENTITY.buildSha is guaranteed non-empty in prod.
 *
 * Side effects on module load:
 *   - window.__APP_BUILD_SHA__       = full SHA
 *   - window.__APP_BUILD_TIMESTAMP__ = ISO build timestamp
 *   - window.__APP_DEPLOYMENT_ID__   = deployment id (may be '')
 *   - window.__APP_BUNDLE_FILENAME__ = resolved bundle filename
 *   - <meta name="app-build-sha" content="...">        (idempotent)
 *   - <meta name="app-build-timestamp" content="...">  (idempotent)
 *   - <meta name="app-deployment-id" content="...">    (idempotent)
 *   - <meta name="app-bundle-filename" content="...">  (idempotent)
 *
 * This module also tracks the last successful 3-5-7 runtime diagnostic
 * event so the global error handler can persist correlation context.
 */

declare const __APP_BUILD_SHA__: string;
declare const __APP_BUILD_TIMESTAMP__: string;
declare const __APP_DEPLOYMENT_ID__: string;

function resolveBundleFilename(): string {
  try {
    const scripts = Array.from(document.querySelectorAll("script[src]")) as HTMLScriptElement[];
    const entry = scripts.find((s) => /\/assets\/index-[^/]+\.js/.test(s.src));
    if (entry) {
      const m = entry.src.match(/\/assets\/[^?#]+/);
      if (m) return m[0];
    }
    // Fallback: import.meta.url of this module's own chunk
    const url = (import.meta as { url?: string }).url;
    if (url) {
      const m = url.match(/\/assets\/[^?#]+/);
      if (m) return m[0];
    }
  } catch {
    /* noop */
  }
  return "";
}

function resolveDeploymentId(): string {
  const fromDefine = typeof __APP_DEPLOYMENT_ID__ !== "undefined" ? __APP_DEPLOYMENT_ID__ : "";
  if (fromDefine) return fromDefine;
  try {
    // Server-side deploys may inject a meta tag; harmless if absent.
    const el = document.querySelector('meta[name="app-deployment-id"]');
    const v = el?.getAttribute("content") ?? "";
    return v;
  } catch {
    return "";
  }
}

const buildSha =
  typeof __APP_BUILD_SHA__ !== "undefined" && __APP_BUILD_SHA__ ? __APP_BUILD_SHA__ : "unknown";
const buildTimestamp =
  typeof __APP_BUILD_TIMESTAMP__ !== "undefined" && __APP_BUILD_TIMESTAMP__
    ? __APP_BUILD_TIMESTAMP__
    : "unknown";

export const BUILD_IDENTITY = {
  buildSha,
  buildShaShort: buildSha.slice(0, 12),
  buildTimestamp,
  deploymentId: resolveDeploymentId(),
  bundleFilename: "",
} as const;

// Runtime installation — window globals + meta tags. Idempotent.
function installMeta(name: string, content: string): void {
  if (!content) return;
  try {
    let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  } catch {
    /* noop */
  }
}

function installBuildIdentity(): void {
  const bundleFilename = resolveBundleFilename();
  (BUILD_IDENTITY as { bundleFilename: string }).bundleFilename = bundleFilename;

  try {
    const w = window as unknown as Record<string, unknown>;
    w.__APP_BUILD_SHA__ = BUILD_IDENTITY.buildSha;
    w.__APP_BUILD_TIMESTAMP__ = BUILD_IDENTITY.buildTimestamp;
    w.__APP_DEPLOYMENT_ID__ = BUILD_IDENTITY.deploymentId;
    w.__APP_BUNDLE_FILENAME__ = bundleFilename;
  } catch {
    /* noop */
  }

  installMeta("app-build-sha", BUILD_IDENTITY.buildSha);
  installMeta("app-build-timestamp", BUILD_IDENTITY.buildTimestamp);
  if (BUILD_IDENTITY.deploymentId) installMeta("app-deployment-id", BUILD_IDENTITY.deploymentId);
  if (bundleFilename) installMeta("app-bundle-filename", bundleFilename);
}

if (typeof window !== "undefined") {
  try {
    installBuildIdentity();
  } catch {
    /* noop */
  }
}

/** Compact envelope embedded in every 357.runtime.* diagnostic event. */
export function buildIdentityEnvelope(): {
  buildSha: string;
  buildTimestamp: string;
  deploymentId: string | null;
  bundleFilename: string | null;
} {
  return {
    buildSha: BUILD_IDENTITY.buildSha,
    buildTimestamp: BUILD_IDENTITY.buildTimestamp,
    deploymentId: BUILD_IDENTITY.deploymentId || null,
    bundleFilename: BUILD_IDENTITY.bundleFilename || null,
  };
}
