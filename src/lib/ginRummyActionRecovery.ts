export const GIN_ACTION_REQUEST_TIMEOUT_MS = 10_000;
export const GIN_ACTION_REQUEST_ATTEMPTS = 2;

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

  const message = errorMessage(error).toLowerCase();
  return [
    'aborted',
    'failed to fetch',
    'fetch failed',
    'networkerror',
    'network error',
    'response loss after send',
    'load failed',
  ].some((fragment) => message.includes(fragment));
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
