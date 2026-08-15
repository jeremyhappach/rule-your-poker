import { parseBuildManifest, type BuildManifest } from "./releasePublication";

const MANIFEST_PATH = "/build-manifest.json";

/**
 * Reads the public production alias directly. `no-store` is intentional: a
 * browser that has kept an old app bundle alive must not satisfy this check
 * from its HTTP cache.
 */
export async function fetchPublishedBuildManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<BuildManifest> {
  const response = await fetchImpl(MANIFEST_PATH, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`release-manifest-http-${response.status}`);
  }

  const parsed = parseBuildManifest(await response.json());
  if (!parsed) {
    throw new Error("release-manifest-invalid");
  }
  return parsed;
}
