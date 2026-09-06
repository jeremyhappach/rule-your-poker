/** A request deadline bounds UI ownership even when auth/fetch ignores abort.
 * Retries must reuse the identical round and expected action sequence. */
export async function executeDiceRequest<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  { replaySafe = true, timeoutMs = 5000 }: { replaySafe?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => operation(controller.signal)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Dice request timed out. Please try again.'));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      const details = error as { code?: string; message?: string; name?: string };
      const retryable = controller.signal.aborted || ['57014', '55P03'].includes(details?.code ?? '') ||
        /fetch|network|timeout|timed out|abort/i.test(details?.message ?? '');
      if (!replaySafe || attempt >= 1 || !retryable) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** PostgREST errors are values, so unwrap inside the bounded attempt. */
export async function executeDiceRpc<T = any>(
  client: { rpc: (name: string, payload: Record<string, unknown>) => any },
  name: string,
  payload: Record<string, unknown>,
  replaySafe = true,
): Promise<T> {
  return executeDiceRequest(async (signal) => {
    const request = client.rpc(name, payload);
    const { data, error } = await request.abortSignal(signal);
    if (error) throw error;
    return data as T;
  }, { replaySafe });
}
