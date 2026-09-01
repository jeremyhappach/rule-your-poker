import { isGinMaskedCard } from './ginRummy/presentationIdentity';
import type { GinRummyActionType, GinRummyState } from './ginRummyTypes';

export const GIN_ACTION_REQUEST_TIMEOUT_MS = 10_000;
export const GIN_ACTION_REQUEST_ATTEMPTS = 2;

const GIN_PUBLIC_REVEAL_PHASES = new Set([
  'knocking',
  'laying_off',
  'scoring',
  'complete',
]);

const GIN_SAFE_PEER_ACTIONS = new Set<GinRummyActionType>([
  'pass_first_draw',
  'draw_stock',
  'draw_discard',
  'discard',
]);

type ReplaySafeGinActionOptions = {
  label?: string;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? error);
  }
  return String(error);
}

export function isRetryableGinTransportError(error: unknown): boolean {
  const name = error instanceof Error
    ? error.name
    : typeof error === 'object' && error && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  if (name === 'AbortError' || name === 'TimeoutError') return true;

  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === '57014') return true;

  const message = errorMessage(error).toLowerCase();
  return [
    'aborted',
    'failed to fetch',
    'fetch failed',
    'networkerror',
    'network error',
    'response loss after send',
    'load failed',
    'statement timeout',
  ].some((fragment) => message.includes(fragment));
}

/**
 * Realtime publishes the public Gin projection. The action actor already owns
 * the caller-specific projection returned by the immutable action RPC, so an
 * equal or older public action count is only an echo. A peer (or an actor
 * whose response is still unresolved) remains behind and must fetch its own
 * private projection.
 */
export function shouldFetchGinProjectionForRealtimeUpdate(
  publicState: unknown,
  latestInstalledActionCount: number | null,
): boolean {
  if (!publicState || typeof publicState !== 'object') return true;
  const rawActionCount = (publicState as { actionCount?: unknown }).actionCount;
  if (typeof rawActionCount !== 'number' || !Number.isFinite(rawActionCount)) return true;
  if (latestInstalledActionCount === null) return true;
  return rawActionCount > latestInstalledActionCount;
}

/**
 * Admits one DB-authored public Realtime step without waiting for a second
 * network request. Before reveal, the public document has both hands masked,
 * so the caller's already-authoritative private hand is carried forward only
 * when exactly one opponent action advanced and its length did not change.
 * Every uncertain shape falls back to the caller-specific state fetch.
 */
export function buildGinPublicPeerProjection(
  publicState: unknown,
  currentState: GinRummyState | null,
  currentPlayerId: string | null,
): GinRummyState | null {
  if (!publicState || typeof publicState !== 'object' || !currentState || !currentPlayerId) {
    return null;
  }

  const incoming = publicState as GinRummyState;
  const incomingActionCount = incoming.actionCount;
  const currentActionCount = currentState.actionCount;
  if (
    !Number.isInteger(incomingActionCount)
    || !Number.isInteger(currentActionCount)
    || incomingActionCount !== (currentActionCount ?? 0) + 1
    || incoming.handNumber !== currentState.handNumber
    || !incoming.playerStates
    || !currentState.playerStates
  ) {
    return null;
  }

  const currentPlayerState = currentState.playerStates[currentPlayerId];
  const incomingPlayerState = incoming.playerStates[currentPlayerId];
  if (
    !currentPlayerState
    || !incomingPlayerState
    || !Array.isArray(currentPlayerState.hand)
    || !Array.isArray(incomingPlayerState.hand)
    || currentPlayerState.hand.some(isGinMaskedCard)
  ) {
    return null;
  }

  if (GIN_PUBLIC_REVEAL_PHASES.has(incoming.phase)) {
    const revealIsExact = Object.values(incoming.playerStates).every(
      player => Array.isArray(player.hand) && player.hand.every(card => !isGinMaskedCard(card)),
    );
    return revealIsExact ? incoming : null;
  }

  const action = incoming.lastAction;
  if (
    !action
    || action.playerId === currentPlayerId
    || !GIN_SAFE_PEER_ACTIONS.has(action.type)
    || incomingPlayerState.hand.length !== currentPlayerState.hand.length
    || incomingPlayerState.hand.some(card => !isGinMaskedCard(card))
  ) {
    return null;
  }

  return {
    ...incoming,
    playerStates: {
      ...incoming.playerStates,
      [currentPlayerId]: {
        ...incomingPlayerState,
        hand: currentPlayerState.hand,
      },
    },
  };
}

/**
 * Runs one immutable Gin intent with a deadline. A retry must use the same
 * expectedActionCount so an ambiguous first commit can only resolve as either
 * the original commit or the server's replay-safe stale_action projection.
 */
export async function executeReplaySafeGinAction<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: ReplaySafeGinActionOptions = {},
): Promise<T> {
  const label = options.label ?? 'Gin action';
  const timeoutMs = options.timeoutMs ?? GIN_ACTION_REQUEST_TIMEOUT_MS;
  const attempts = options.attempts ?? GIN_ACTION_REQUEST_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? 250;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await operation(controller.signal);
    } catch (error) {
      lastError = error;
      const retryable = timedOut || isRetryableGinTransportError(error);
      if (!retryable) throw error;
      if (attempt === attempts) {
        throw new Error(
          `${label} could not be confirmed after ${attempts} attempts. ` +
          'Your table will resync; try the action again if it is still available.',
        );
      }
    } finally {
      clearTimeout(timer);
    }
    await wait(retryDelayMs);
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} exhausted its retry budget`);
}
