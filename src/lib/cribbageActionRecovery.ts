export const CRIBBAGE_ACTION_REQUEST_TIMEOUT_MS = 10_000;
export const CRIBBAGE_ACTION_REQUEST_ATTEMPTS = 2;

type ReplaySafeCribbageActionOptions = {
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

export function isRetryableCribbageActionError(error: unknown): boolean {
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
 * Runs one immutable Cribbage intent with a deadline. The caller must reuse
 * the same round, player, action, card index, and expected event sequence for
 * every attempt. PostgreSQL then resolves an ambiguous first commit as either
 * the applied action or a replay-safe stale projection.
 */
export async function executeReplaySafeCribbageAction<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: ReplaySafeCribbageActionOptions = {},
): Promise<T> {
  const label = options.label ?? 'Cribbage action';
  const timeoutMs = options.timeoutMs ?? CRIBBAGE_ACTION_REQUEST_TIMEOUT_MS;
  const attempts = options.attempts ?? CRIBBAGE_ACTION_REQUEST_ATTEMPTS;
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
      const retryable = timedOut || isRetryableCribbageActionError(error);
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

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} exhausted its retry budget`);
}
