import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

function getGitShaShort(): string | null {
  try {
    const out = execSync("git rev-parse --short=12 HEAD").toString().trim();
    return /^[0-9a-f]{7,40}$/i.test(out) ? out : null;
  } catch {
    return null;
  }
}

function getGitShaFull(): string | null {
  // Prefer explicit env overrides from the deploy pipeline; fall back to
  // whatever `git` returns inside the build container.
  const fromEnv =
    process.env.LOVABLE_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    null;
  if (fromEnv && /^[0-9a-f]{40}$/i.test(fromEnv)) return fromEnv;
  try {
    const out = execSync("git rev-parse HEAD").toString().trim();
    return /^[0-9a-f]{40}$/i.test(out) ? out : null;
  } catch {
    return null;
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  const fullSha = getGitShaFull();
  const shortSha = getGitShaShort();

  // Release-integrity guard: production builds MUST embed a real 40-char
  // commit SHA. No "dev" fallback, no empty string, no "unknown". If the
  // build environment cannot produce a SHA, fail loud — a bundle with no
  // build identity is unshippable per the diagnostic-only contract.
  if (isProd && !fullSha) {
    throw new Error(
      "[vite.config] Production build aborted: unable to resolve a 40-char " +
        "Git SHA. Set LOVABLE_COMMIT_SHA (or COMMIT_SHA / VERCEL_GIT_COMMIT_SHA / " +
        "GITHUB_SHA) in the build environment, or run inside a git checkout.",
    );
  }

  const effectiveFullSha = fullSha ?? "dev-no-git";
  const effectiveShortSha = shortSha ?? effectiveFullSha.slice(0, 12);
  const buildTimestamp = new Date().toISOString();
  const deploymentId =
    process.env.LOVABLE_DEPLOYMENT_ID ||
    process.env.DEPLOYMENT_ID ||
    "";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      // Legacy short hash kept for existing consumers (buildMeta, cribbage
      // scoring trace, etc). Now sourced from the same authoritative pipeline.
      __BUILD_HASH__: JSON.stringify(effectiveShortSha),
      __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
      // Full 40-char SHA — required for release-integrity reconciliation.
      __APP_BUILD_SHA__: JSON.stringify(effectiveFullSha),
      __APP_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
      __APP_DEPLOYMENT_ID__: JSON.stringify(deploymentId),
      // Phase 7: enable canonical neutral interstitial between dealer games.
      // Phase 5 shell-lift flag (VITE_CANONICAL_SHELL_LIFT) is intentionally
      // NOT set here so its existing rollback behavior remains intact.
      "import.meta.env.VITE_CANONICAL_SLOT_NEUTRAL": JSON.stringify("on"),
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      {
        // Emits /build-manifest.json alongside the bundle so an already-open
        // client can independently detect a newer publication.
        // The manifest is generated at build time and served fresh (no-store
        // fetch on the client) — old cached bundles cannot mask a new value.
        name: "emit-build-manifest",
        apply: "build" as const,
        generateBundle(_options, bundle) {
          let entryBundleFilename = "";
          for (const [fileName, chunk] of Object.entries(bundle)) {
            if ((chunk as { type?: string }).type === "chunk" && (chunk as { isEntry?: boolean }).isEntry) {
              entryBundleFilename = fileName;
              break;
            }
          }
          const manifest = {
            buildId: effectiveFullSha,
            publishedAt: buildTimestamp,
            bundleFilename: entryBundleFilename,
            deploymentId,
          };
          (this as { emitFile: (opts: unknown) => void }).emitFile({
            type: "asset",
            fileName: "build-manifest.json",
            source: JSON.stringify(manifest, null, 2),
          });
        },
      },
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
