/**
 * Manual trace helpers for non-Supabase operations
 */

import { trace, isTracing, setTraceGameId } from "./performanceTracer";

/**
 * Trace a UI event/milestone (zero duration marker)
 */
export function traceMilestone(name: string, metadata?: Record<string, unknown>): void {
  if (!isTracing()) return;
  trace(`milestone:${name}`, 0, undefined, metadata);
}

/**
 * Trace a timed operation
 */
export function traceOperation(
  operation: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  if (!isTracing()) return;
  trace(operation, durationMs, undefined, metadata);
}

/**
 * Higher-order function to wrap and time any async operation
 */
export async function withTrace<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  if (!isTracing()) {
    return fn();
  }

  const start = performance.now();
  try {
    const result = await fn();
    trace(operation, performance.now() - start, undefined, metadata);
    return result;
  } catch (error) {
    trace(operation, performance.now() - start, undefined, { ...metadata, error: String(error) });
    throw error;
  }
}

/**
 * Create a trace span that must be manually ended
 */
export function startSpan(operation: string): { end: (metadata?: Record<string, unknown>) => void } {
  const start = performance.now();
  return {
    end: (metadata?: Record<string, unknown>) => {
      if (isTracing()) {
        trace(operation, performance.now() - start, undefined, metadata);
      }
    }
  };
}

/**
 * Associate current trace with a game
 */
export function linkTraceToGame(gameId: string): void {
  setTraceGameId(gameId);
}

// Re-export isTracing for convenience
export { isTracing } from "./performanceTracer";
