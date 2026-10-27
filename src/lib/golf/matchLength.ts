export const GOLF_HOLE_COUNTS = [3, 6, 9, 18] as const;
export type GolfHoleCount = typeof GOLF_HOLE_COUNTS[number];
export const isGolfHoleCount = (value: unknown): value is GolfHoleCount =>
  GOLF_HOLE_COUNTS.some(count => count === value);
/** Missing legacy configuration always means nine, independent of today's defaults. */
export const golfHoleCount = (value: unknown): GolfHoleCount => isGolfHoleCount(value) ? value : 9;
export const golfScorecardLabel = (value: unknown) => `${golfHoleCount(value)}-hole scorecard`;
