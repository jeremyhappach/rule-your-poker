export function shouldDebounceObserverDice(
  isObserver: boolean,
  gameType: string | undefined,
): boolean {
  return isObserver && gameType !== 'yahtzee';
}

export function selectDicePresentation<T>(
  dice: T[],
  debouncedDice: T[],
  isObserver: boolean,
  gameType: string | undefined,
): T[] {
  return shouldDebounceObserverDice(isObserver, gameType) ? debouncedDice : dice;
}
