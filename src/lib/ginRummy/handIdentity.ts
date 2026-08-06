export const GIN_INITIAL_HAND_NUMBER = 1;

export function deriveGinSuccessorHandNumber(predecessorHandNumber: number): number {
  if (!Number.isSafeInteger(predecessorHandNumber) || predecessorHandNumber < GIN_INITIAL_HAND_NUMBER) {
    throw new Error(`Invalid Gin predecessor hand number: ${predecessorHandNumber}`);
  }

  return predecessorHandNumber + 1;
}
