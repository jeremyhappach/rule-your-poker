import { describe, expect, it } from "vitest";
import { fetchPublishedBuildManifest } from "./releaseManifest";

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("fetchPublishedBuildManifest", () => {
  it("uses a cache-bypassing request and validates the returned manifest", async () => {
    let receivedUrl = "";
    let receivedInit: RequestInit | undefined;
    const manifest = await fetchPublishedBuildManifest(async (url, init) => {
      receivedUrl = String(url);
      receivedInit = init;
      return new Response(JSON.stringify({
        buildId: SHA,
        publishedAt: "2026-08-15T16:00:00.000Z",
        deploymentId: "deployment-a",
      }));
    });

    expect(receivedUrl).toBe("/build-manifest.json");
    expect(receivedInit?.cache).toBe("no-store");
    expect(manifest.buildId).toBe(SHA);
  });

  it("fails closed when the manifest is not a valid production identity", async () => {
    await expect(fetchPublishedBuildManifest(async () => new Response("{}")))
      .rejects.toThrow("release-manifest-invalid");
  });
});
