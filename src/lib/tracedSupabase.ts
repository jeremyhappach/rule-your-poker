import { supabase } from "@/integrations/supabase/client";
import { trace, isTracing } from "./performanceTracer";

type QueryBuilder = ReturnType<typeof supabase.from>;

/**
 * Wrap a Supabase query with automatic performance tracing.
 * Usage:
 *   const { data, error } = await tracedQuery('fetch_players', 'players', 
 *     supabase.from('players').select('*').eq('game_id', gameId)
 *   );
 */
export async function tracedQuery<T>(
  operation: string,
  tableName: string,
  query: PromiseLike<{ data: T; error: any }>,
  metadata?: Record<string, unknown>
): Promise<{ data: T; error: any }> {
  if (!isTracing()) {
    return query;
  }

  const start = performance.now();
  const result = await query;
  const duration = performance.now() - start;

  trace(operation, duration, tableName, {
    ...metadata,
    hasError: !!result.error,
    rowCount: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
  });

  return result;
}

/**
 * Trace a batch of parallel queries
 */
export async function tracedParallel<T extends readonly unknown[]>(
  operation: string,
  queries: { [K in keyof T]: Promise<T[K]> }
): Promise<T> {
  if (!isTracing()) {
    return Promise.all(queries) as Promise<T>;
  }

  const start = performance.now();
  const results = await Promise.all(queries);
  const duration = performance.now() - start;

  trace(operation, duration, 'parallel', { queryCount: queries.length });

  return results as T;
}

/**
 * Trace a generic async operation (not a Supabase query)
 */
export async function tracedOp<T>(
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
 * Mark a synchronous event/milestone in the trace
 */
export function traceMilestone(name: string, metadata?: Record<string, unknown>): void {
  trace(`milestone:${name}`, 0, undefined, metadata);
}
