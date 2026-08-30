export type ExactGinRummyRunBackConfig = {
  ante_amount: number;
  points_to_win: number;
  per_point_value: number;
  gin_bonus: number;
  undercut_bonus: number;
};

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum;
}

/**
 * Run It Back must reproduce the committed dealer-game configuration exactly.
 * Missing fields are rejected instead of being replaced by setup-form defaults.
 */
export function resolveExactGinRummyRunBackConfig(
  value: unknown,
): ExactGinRummyRunBackConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const config = value as Record<string, unknown>;

  if (
    !isIntegerAtLeast(config.ante_amount, 1)
    || !isIntegerAtLeast(config.points_to_win, 1)
    || !isIntegerAtLeast(config.per_point_value, 0)
    || !isIntegerAtLeast(config.gin_bonus, 0)
    || !isIntegerAtLeast(config.undercut_bonus, 0)
  ) {
    return null;
  }

  return {
    ante_amount: config.ante_amount,
    points_to_win: config.points_to_win,
    per_point_value: config.per_point_value,
    gin_bonus: config.gin_bonus,
    undercut_bonus: config.undercut_bonus,
  };
}
