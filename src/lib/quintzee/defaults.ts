export const QUINTZEE_ROUND_SECONDS = { initial: 240, min: 60, max: 600 } as const;
export function isQuintzeeRoundSeconds(value: number): boolean {
  return Number.isInteger(value) && value >= QUINTZEE_ROUND_SECONDS.min && value <= QUINTZEE_ROUND_SECONDS.max;
}
