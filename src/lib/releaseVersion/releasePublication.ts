/**
 * The current production release is a small, public, non-gameplay record.
 *
 * The record is written only by the verified release publisher. Browsers may
 * read it and receive its realtime updates, but it must never become a source
 * of gameplay, account, or financial state.
 */

export const RELEASE_PUBLICATION_SETTING_KEY = "release_publication";

const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface ReleasePublication {
  schemaVersion: 1;
  buildSha: string;
  deploymentId: string;
  publishedAt: string;
}

export interface BuildManifest {
  buildId: string;
  publishedAt: string;
  deploymentId: string;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFullBuildSha(value: unknown): value is string {
  return typeof value === "string" && FULL_SHA.test(value);
}

export function parseReleasePublication(value: unknown): ReleasePublication | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== 1) return null;
  if (!isFullBuildSha(value.buildSha)) return null;
  if (typeof value.deploymentId !== "string" || !value.deploymentId) return null;
  if (!isIsoTimestamp(value.publishedAt)) return null;

  return {
    schemaVersion: 1,
    buildSha: value.buildSha.toLowerCase(),
    deploymentId: value.deploymentId,
    publishedAt: value.publishedAt,
  };
}

export function parseBuildManifest(value: unknown): BuildManifest | null {
  if (!isRecord(value)) return null;
  if (!isFullBuildSha(value.buildId)) return null;
  if (!isIsoTimestamp(value.publishedAt)) return null;
  if (typeof value.deploymentId !== "string") return null;

  return {
    buildId: value.buildId.toLowerCase(),
    publishedAt: value.publishedAt,
    deploymentId: value.deploymentId,
  };
}

export function isNewerRelease(
  candidate: ReleasePublication,
  current: ReleasePublication | null,
): boolean {
  if (!current) return true;
  const candidateTime = Date.parse(candidate.publishedAt);
  const currentTime = Date.parse(current.publishedAt);
  return candidateTime > currentTime;
}

export function isBuildCurrent(runningBuildSha: string, publishedBuildSha: string | null): boolean {
  return !publishedBuildSha || runningBuildSha.toLowerCase() === publishedBuildSha.toLowerCase();
}

export type ReleaseCheckStatus = "checking" | "current" | "stale" | "unavailable";

export function shouldBlockGameEntry(status: ReleaseCheckStatus): boolean {
  return status !== "current";
}

export type GameRouteReleaseDecision = "render-game" | "checking" | "unavailable" | "refresh-required";

export function getGameRouteReleaseDecision(
  status: ReleaseCheckStatus,
  alreadyAdmitted: boolean,
): GameRouteReleaseDecision {
  if (alreadyAdmitted || status === "current") return "render-game";
  if (status === "checking") return "checking";
  if (status === "unavailable") return "unavailable";
  return "refresh-required";
}

export function shouldShowLobbyReleaseModal(
  status: ReleaseCheckStatus,
  isGameRoute: boolean,
): boolean {
  return !isGameRoute && (status === "stale" || status === "unavailable");
}
