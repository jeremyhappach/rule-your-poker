import { describe, expect, it } from "vitest";
import {
  isBuildCurrent,
  isNewerRelease,
  getGameEntryReleaseDecision,
  getGameRouteReleaseDecision,
  parseBuildManifest,
  parseReleasePublication,
  shouldBlockGameEntry,
  shouldShowLobbyReleaseModal,
  type ReleasePublication,
} from "./releasePublication";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function release(overrides: Partial<ReleasePublication> = {}): ReleasePublication {
  return {
    schemaVersion: 1,
    buildSha: SHA_A,
    deploymentId: "deployment-a",
    publishedAt: "2026-08-15T16:00:00.000Z",
    ...overrides,
  };
}

describe("release publication contract", () => {
  it("accepts only a complete versioned release record", () => {
    expect(parseReleasePublication(release({ buildSha: SHA_A.toUpperCase() }))).toEqual(release());
    expect(parseReleasePublication({ ...release(), buildSha: "short" })).toBeNull();
    expect(parseReleasePublication({ ...release(), schemaVersion: 2 })).toBeNull();
    expect(parseReleasePublication({ ...release(), publishedAt: "not-a-date" })).toBeNull();
  });

  it("accepts the production manifest only when it has a complete SHA", () => {
    expect(parseBuildManifest({ buildId: SHA_A, publishedAt: "2026-08-15T16:00:00.000Z", deploymentId: "" }))
      .toEqual({ buildId: SHA_A, publishedAt: "2026-08-15T16:00:00.000Z", deploymentId: "" });
    expect(parseBuildManifest({ buildId: "unknown", publishedAt: "2026-08-15T16:00:00.000Z", deploymentId: "" }))
      .toBeNull();
  });

  it("does not let a duplicate or late notification replace a newer release", () => {
    const current = release({ publishedAt: "2026-08-15T16:01:00.000Z" });
    expect(isNewerRelease(release({ buildSha: SHA_B, publishedAt: "2026-08-15T16:01:00.000Z" }), current)).toBe(false);
    expect(isNewerRelease(release({ buildSha: SHA_B, publishedAt: "2026-08-15T16:00:59.000Z" }), current)).toBe(false);
  });

  it("keeps a live table mounted while blocking stale or unverifiable game entry", () => {
    expect(isBuildCurrent(SHA_A, SHA_A)).toBe(true);
    expect(isBuildCurrent(SHA_A, SHA_B)).toBe(false);
    expect(shouldBlockGameEntry("checking")).toBe(true);
    expect(shouldBlockGameEntry("unavailable")).toBe(true);
    expect(shouldBlockGameEntry("stale")).toBe(true);
    expect(shouldBlockGameEntry("current")).toBe(false);
    expect(shouldShowLobbyReleaseModal("stale", false)).toBe(true);
    expect(shouldShowLobbyReleaseModal("stale", true)).toBe(false);
    expect(getGameRouteReleaseDecision("stale", false)).toBe("refresh-required");
    expect(getGameRouteReleaseDecision("checking", false)).toBe("checking");
    expect(getGameRouteReleaseDecision("unavailable", false)).toBe("unavailable");
    expect(getGameRouteReleaseDecision("stale", true)).toBe("render-game");
    expect(getGameEntryReleaseDecision("checking", "current", false)).toBe("checking");
    expect(getGameEntryReleaseDecision("stale", "current", false)).toBe("refresh-required");
    expect(getGameEntryReleaseDecision("current", "stale", false)).toBe("refresh-required");
    expect(getGameEntryReleaseDecision("current", "current", false)).toBe("render-game");
    expect(getGameEntryReleaseDecision("current", "stale", true)).toBe("render-game");
  });
});
