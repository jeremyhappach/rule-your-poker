import { supabase } from "@/integrations/supabase/client";
import { isDiceSnapEnabled, getDiceSnapLabel } from "./enabled";

export type DiceSnapSample = {
  t_ms: number;
  frame_seq: number;
  cache_key?: string | null;
  roll_key?: string | null;
  die_index: number;
  die_value?: number | null;
  die_is_held: boolean;
  die_is_held_in_layout?: boolean | null;
  is_observer?: boolean | null;
  is_rolling?: boolean | null;
  is_animating_fly_in?: boolean | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  container_w?: number | null;
  container_h?: number | null;
  extra?: Record<string, unknown>;
};

type RecorderState = {
  sessionId: string | null;
  starting: Promise<string | null> | null;
  buffer: DiceSnapSample[];
  flushInFlight: Promise<void> | null;
  lastFlushAt: number;
};

const state: RecorderState = {
  sessionId: null,
  starting: null,
  buffer: [],
  flushInFlight: null,
  lastFlushAt: 0,
};

const MAX_BUFFER = 250; // ~50ms * 5 dice * 1-2s
const FLUSH_EVERY_MS = 1200;

async function ensureSession(): Promise<string | null> {
  if (!isDiceSnapEnabled()) return null;
  if (state.sessionId) return state.sessionId;
  if (state.starting) return state.starting;

  state.starting = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("dice_trace_sessions" as any)
      .insert({ user_id: user.id, label: getDiceSnapLabel() } as any)
      .select("id")
      .single();

    if (error || !data) {
      console.warn("[DICE_SNAP] failed to start session", error?.message);
      return null;
    }

    state.sessionId = (data as any).id as string;
    return state.sessionId;
  })();

  const id = await state.starting;
  state.starting = null;
  return id;
}

async function flush(): Promise<void> {
  if (state.flushInFlight) return state.flushInFlight;
  if (!state.sessionId) return;
  if (state.buffer.length === 0) return;

  const entries = state.buffer.splice(0, state.buffer.length);
  state.flushInFlight = (async () => {
    try {
      const { error } = await supabase
        .from("dice_trace_samples" as any)
        .insert(
          entries.map((s) => ({
            session_id: state.sessionId,
            t_ms: s.t_ms,
            frame_seq: s.frame_seq,
            cache_key: s.cache_key ?? null,
            roll_key: s.roll_key ?? null,
            die_index: s.die_index,
            die_value: s.die_value ?? null,
            die_is_held: s.die_is_held,
            die_is_held_in_layout: s.die_is_held_in_layout ?? null,
            is_observer: s.is_observer ?? null,
            is_rolling: s.is_rolling ?? null,
            is_animating_fly_in: s.is_animating_fly_in ?? null,
            x: s.x ?? null,
            y: s.y ?? null,
            w: s.w ?? null,
            h: s.h ?? null,
            container_w: s.container_w ?? null,
            container_h: s.container_h ?? null,
            extra: s.extra ?? {},
          })) as any,
        );

      if (error) {
        // If insert fails, drop samples to avoid unbounded growth.
        console.warn("[DICE_SNAP] flush failed", error.message);
      }
    } finally {
      state.lastFlushAt = Date.now();
      state.flushInFlight = null;
    }
  })();

  return state.flushInFlight;
}

export async function recordDiceSnapFrame(samples: DiceSnapSample[]): Promise<void> {
  if (!isDiceSnapEnabled()) return;
  const sessionId = await ensureSession();
  if (!sessionId) return;

  // Keep buffer bounded.
  state.buffer.push(...samples);
  if (state.buffer.length > MAX_BUFFER) {
    state.buffer = state.buffer.slice(-MAX_BUFFER);
  }

  if (Date.now() - state.lastFlushAt > FLUSH_EVERY_MS) {
    void flush();
  }
}

export function getDiceSnapSessionId(): string | null {
  return state.sessionId;
}
