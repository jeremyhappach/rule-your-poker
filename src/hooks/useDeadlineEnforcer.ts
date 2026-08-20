/**
 * Compatibility hook retained while call sites migrate.
 *
 * Deadline progression is owned by PostgreSQL's serialized one-second timer
 * dispatcher. Mounting, reconnecting, focusing, or closing a browser must not
 * create or remove an enforcement owner.
 */
export const useDeadlineEnforcer = (
  _gameId: string | undefined,
  _gameStatus: string | undefined,
) => undefined;
