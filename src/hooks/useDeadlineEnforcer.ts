/**
 * TEMPORARILY DISABLED FOR PERFORMANCE TESTING
 * This hook is a no-op to isolate whether deadline enforcement is causing slowness.
 * 
 * Original functionality: Smart deadline enforcer using realtime subscriptions
 * to minimize edge function calls, with polling when deadlines are imminent.
 */
export const useDeadlineEnforcer = (_gameId: string | undefined, _gameStatus: string | undefined) => {
  // NO-OP: All deadline enforcement disabled for testing
  // The cron job has also been disabled
  return;
};
