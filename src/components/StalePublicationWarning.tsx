/**
 * Stale Publication Warning
 *
 * Fetches /build-manifest.json (emitted at build time by vite.config.ts)
 * with no-store cache-busting and compares its `buildId` against the
 * immutable CLIENT_BUILD_ID compiled into the currently running bundle.
 *
 * When a newer publication is detected the component overlays a
 * persistent, non-blocking banner above all game UI. RELOAD NOW asks
 * any registered service worker to update, then reloads with a cache-
 * busting query parameter. Supabase auth and game identity are
 * preserved (auth lives in localStorage; the reload only busts HTTP
 * cache for the HTML/asset requests).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_IDENTITY } from "@/lib/buildIdentity";

const MANIFEST_PATH = "/build-manifest.json";
const POLL_INTERVAL_MS = 60_000;

type ManifestState =
  | { kind: "checking" }
  | { kind: "unknown"; reason: string }
  | { kind: "known"; buildId: string; publishedAt: string | null; bundleFilename: string | null };

interface ManifestJson {
  buildId?: unknown;
  publishedAt?: unknown;
  bundleFilename?: unknown;
}

async function fetchManifest(): Promise<ManifestState> {
  try {
    const res = await fetch(`${MANIFEST_PATH}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) {
      return { kind: "unknown", reason: `http_${res.status}` };
    }
    const json = (await res.json()) as ManifestJson;
    const buildId = typeof json.buildId === "string" ? json.buildId : "";
    if (!buildId) return { kind: "unknown", reason: "no_build_id" };
    return {
      kind: "known",
      buildId,
      publishedAt: typeof json.publishedAt === "string" ? json.publishedAt : null,
      bundleFilename: typeof json.bundleFilename === "string" ? json.bundleFilename : null,
    };
  } catch (e) {
    return { kind: "unknown", reason: e instanceof Error ? e.name : "fetch_error" };
  }
}

async function performReload(latestBuildId: string): Promise<void> {
  // Ask any registered service worker to update, but do not block the reload.
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.update()));
    }
  } catch {
    /* noop */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_v", latestBuildId.slice(0, 12));
  url.searchParams.set("_t", String(Date.now()));
  // Preserve auth (localStorage) and route; only HTTP cache is invalidated.
  window.location.replace(url.toString());
}

export function StalePublicationWarning() {
  const runningBuildId = BUILD_IDENTITY.buildSha;
  const [state, setState] = useState<ManifestState>({ kind: "checking" });
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    const result = await fetchManifest();
    if (!mountedRef.current) return;
    setState(result);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void check();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onFocus = () => { void check(); };
    const onPageShow = () => { void check(); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    const interval = window.setInterval(() => { void check(); }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(interval);
    };
  }, [check]);

  const isStale =
    state.kind === "known" &&
    !!state.buildId &&
    !!runningBuildId &&
    runningBuildId !== "unknown" &&
    state.buildId !== runningBuildId;

  if (!isStale) return null;

  const latestShort = state.kind === "known" ? state.buildId.slice(0, 12) : "";
  const runningShort = runningBuildId.slice(0, 12);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        left: 8,
        right: 8,
        zIndex: 2147483000,
        pointerEvents: "auto",
        background: "#7f1d1d",
        color: "#fff",
        border: "2px solid #fca5a5",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 13,
        lineHeight: 1.35,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
      data-stale-publication-warning
    >
      <span style={{ fontWeight: 700, fontSize: 14 }}>⚠ NEW VERSION PUBLISHED</span>
      <span style={{ opacity: 0.9, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        Running: {runningShort} · Latest: {latestShort}
      </span>
      <button
        type="button"
        onClick={() => { void performReload(state.kind === "known" ? state.buildId : ""); }}
        style={{
          marginLeft: "auto",
          background: "#fff",
          color: "#7f1d1d",
          border: "none",
          borderRadius: 6,
          padding: "6px 12px",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        RELOAD NOW
      </button>
    </div>
  );
}

/**
 * Small inline status row for the SNAP pill / build-status area.
 * Returns { runningBuildId, latestBuildId, status } for external display.
 */
export function useBuildFreshnessStatus() {
  const runningBuildId = BUILD_IDENTITY.buildSha;
  const [state, setState] = useState<ManifestState>({ kind: "checking" });

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const r = await fetchManifest();
      if (alive) setState(r);
    };
    void run();
    const iv = window.setInterval(() => { void run(); }, POLL_INTERVAL_MS);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);

  let status: "current" | "stale" | "unknown" | "checking";
  let latestBuildId: string | null = null;
  if (state.kind === "checking") status = "checking";
  else if (state.kind === "unknown") status = "unknown";
  else {
    latestBuildId = state.buildId;
    status = state.buildId === runningBuildId ? "current" : "stale";
  }
  return { runningBuildId, latestBuildId, status };
}
