const HOLM_PRESENTATION_STATUSES = new Set([
  'in_progress',
  'game_over',
  'session_ended',
]);

export function shouldResetHolmProjection(args: {
  snapshotAvailable: boolean;
  presentedDealerGameId: string | null | undefined;
  currentDealerGameId: string | null | undefined;
  gameStatus: string | null | undefined;
}): boolean {
  if (args.snapshotAvailable || !args.presentedDealerGameId) return false;
  if (!args.currentDealerGameId) return true;
  if (args.presentedDealerGameId !== args.currentDealerGameId) return true;
  return !HOLM_PRESENTATION_STATUSES.has(args.gameStatus ?? '');
}
