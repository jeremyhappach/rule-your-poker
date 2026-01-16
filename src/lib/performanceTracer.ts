import { supabase } from "@/integrations/supabase/client";

interface TraceEntry {
  operation: string;
  table_name?: string;
  duration_ms: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface TracerState {
  isRecording: boolean;
  sessionId: string | null;
  userId: string | null;
  gameId: string | null;
  buffer: TraceEntry[];
  flushTimeout: NodeJS.Timeout | null;
}

const state: TracerState = {
  isRecording: false,
  sessionId: null,
  userId: null,
  gameId: null,
  buffer: [],
  flushTimeout: null,
};

const BUFFER_SIZE = 20;
const FLUSH_INTERVAL_MS = 2000;

async function flushBuffer(): Promise<void> {
  if (state.buffer.length === 0 || !state.sessionId || !state.userId) return;

  const entries = [...state.buffer];
  state.buffer = [];

  try {
    const { error } = await supabase
      .from('performance_traces' as any)
      .insert(
        entries.map((e) => ({
          session_id: state.sessionId,
          user_id: state.userId,
          operation: e.operation,
          table_name: e.table_name || null,
          duration_ms: e.duration_ms,
          metadata: e.metadata || {},
          created_at: e.created_at,
        })) as any
      );

    if (error) {
      console.error('[Tracer] Flush error:', error);
      // Re-add to buffer on error
      state.buffer = [...entries, ...state.buffer];
    }
  } catch (err) {
    console.error('[Tracer] Flush exception:', err);
  }
}

function scheduleFlush(): void {
  if (state.flushTimeout) return;
  state.flushTimeout = setTimeout(() => {
    state.flushTimeout = null;
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Start recording a performance trace session
 */
export async function startTrace(label?: string, gameId?: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[Tracer] No user logged in');
    return null;
  }

  const { data, error } = await supabase
    .from('trace_sessions' as any)
    .insert({
      user_id: user.id,
      label: label || 'trace',
      game_id: gameId || null,
    } as any)
    .select('id')
    .single();

  if (error || !data) {
    console.error('[Tracer] Failed to start trace:', error);
    return null;
  }

  state.isRecording = true;
  state.sessionId = (data as any).id;
  state.userId = user.id;
  state.gameId = gameId || null;
  state.buffer = [];

  console.log(`[Tracer] 🔴 Recording started: ${state.sessionId?.slice(0, 8)}`);
  return state.sessionId;
}

/**
 * Stop recording and finalize the trace session
 */
export async function stopTrace(): Promise<void> {
  if (!state.isRecording || !state.sessionId) return;

  // Flush remaining buffer
  if (state.flushTimeout) {
    clearTimeout(state.flushTimeout);
    state.flushTimeout = null;
  }
  await flushBuffer();

  // Calculate summary stats
  const { data: traces } = await supabase
    .from('performance_traces' as any)
    .select('duration_ms')
    .eq('session_id', state.sessionId);

  const durations = (traces as any[] || []).map((t: any) => t.duration_ms);
  const total = durations.length;
  const slowest = Math.max(...durations, 0);
  const avg = total > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / total : 0;

  await supabase
    .from('trace_sessions' as any)
    .update({
      ended_at: new Date().toISOString(),
      total_operations: total,
      slowest_operation_ms: slowest,
      avg_duration_ms: Math.round(avg * 100) / 100,
    } as any)
    .eq('id', state.sessionId);

  console.log(`[Tracer] ⏹ Recording stopped. ${total} ops, slowest: ${slowest}ms, avg: ${avg.toFixed(1)}ms`);

  state.isRecording = false;
  state.sessionId = null;
  state.userId = null;
  state.gameId = null;
}

/**
 * Set the game ID for the current trace session
 */
export async function setTraceGameId(gameId: string): Promise<void> {
  if (!state.isRecording || !state.sessionId) return;
  state.gameId = gameId;
  
  await supabase
    .from('trace_sessions' as any)
    .update({ game_id: gameId } as any)
    .eq('id', state.sessionId);
}

/**
 * Record a single operation trace
 */
export function trace(
  operation: string,
  durationMs: number,
  tableName?: string,
  metadata?: Record<string, unknown>
): void {
  if (!state.isRecording) return;

  const entry: TraceEntry = {
    operation,
    table_name: tableName,
    duration_ms: Math.round(durationMs),
    metadata,
    created_at: new Date().toISOString(),
  };

  state.buffer.push(entry);

  // Log slow operations immediately
  if (durationMs > 500) {
    console.warn(`[Tracer] ⚠️ SLOW: ${operation} (${tableName || 'n/a'}) took ${durationMs.toFixed(0)}ms`, metadata);
  }

  if (state.buffer.length >= BUFFER_SIZE) {
    flushBuffer();
  } else {
    scheduleFlush();
  }
}

/**
 * Higher-order function to wrap async operations with tracing
 */
export function traced<T>(
  operation: string,
  fn: () => Promise<T>,
  tableName?: string,
  metadata?: Record<string, unknown>
): Promise<T> {
  if (!state.isRecording) {
    return fn();
  }

  const start = performance.now();
  return fn().then(
    (result) => {
      trace(operation, performance.now() - start, tableName, metadata);
      return result;
    },
    (error) => {
      trace(operation, performance.now() - start, tableName, { ...metadata, error: String(error) });
      throw error;
    }
  );
}

/**
 * Check if tracing is currently active
 */
export function isTracing(): boolean {
  return state.isRecording;
}

/**
 * Get current session ID
 */
export function getTraceSessionId(): string | null {
  return state.sessionId;
}
