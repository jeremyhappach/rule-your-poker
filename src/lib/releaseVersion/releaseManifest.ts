import { parseBuildManifest, type BuildManifest } from "./releasePublication";

const MANIFEST_PATH = "/build-manifest.json";

/**
 * Reads the public production alias directly. `no-store` is intentional: a
 * browser that has kept an old app bundle alive must not satisfy this check
 * from its HTTP cache.
 */
export async function fetchPublishedBuildManifest(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8_000,
): Promise<BuildManifest> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error("release-manifest-timeout"));
    }, timeoutMs);
  });
  let response: Response;
  try {
    response = await Promise.race([
      fetchImpl(MANIFEST_PATH, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
        signal: controller.signal,
      }),
      timeout,
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
  if (!response.ok) {
    throw new Error(`release-manifest-http-${response.status}`);
  }

  const parsed = parseBuildManifest(await response.json());
  if (!parsed) {
    throw new Error("release-manifest-invalid");
  }
  return parsed;
}
