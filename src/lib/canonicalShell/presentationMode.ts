export type PresentationMode = 'table' | 'fullscreen';
export interface GamePresentationMetadata { game_type: string; presentation_mode?: unknown }

export function catalogGameKey(gameType: string | null | undefined): string | null {
  if (gameType === 'holm-game') return 'holm';
  if (gameType === '357' || gameType === '3-5-7-game') return '3-5-7';
  return gameType ?? null;
}

/** Catalog metadata changes presentation only; shared setup/lobby stay on the table. */
export function resolvePresentationMode(
  catalog: readonly GamePresentationMetadata[],
  gameType: string | null | undefined,
  dealerGameId: string | null | undefined,
  status: string | null | undefined,
  sessionEnded = false,
): PresentationMode {
  if (!sessionEnded && (!dealerGameId || !['in_progress', 'game_over'].includes(status ?? ''))) return 'table';
  return catalog.find(row => row.game_type === catalogGameKey(gameType))?.presentation_mode === 'fullscreen'
    ? 'fullscreen' : 'table';
}
