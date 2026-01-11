import { useRef, useCallback, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TimingSnapshot {
  timestamp: number;
  elapsed: number;
  states: Record<string, string | number | boolean>;
}

export interface TimingSession {
  id: string;
  label: string;
  startTime: number;
  snapshots: TimingSnapshot[];
  events: Array<{ timestamp: number; elapsed: number; event: string }>;
}

// Global session storage
let currentSession: TimingSession | null = null;
let snapshotInterval: ReturnType<typeof setInterval> | null = null;
let stateGetters: Map<string, () => Record<string, string | number | boolean>> = new Map();
const sessionListeners: Set<() => void> = new Set();

export function registerStateGetter(id: string, getter: () => Record<string, string | number | boolean>) {
  stateGetters.set(id, getter);
  return () => stateGetters.delete(id);
}

export function logTimingEvent(event: string) {
  if (!currentSession) return;
  const now = Date.now();
  currentSession.events.push({
    timestamp: now,
    elapsed: now - currentSession.startTime,
    event
  });
  notifyListeners();
}

function notifyListeners() {
  sessionListeners.forEach(cb => cb());
}

function takeSnapshot() {
  if (!currentSession) return;
  const now = Date.now();
  const states: Record<string, string | number | boolean> = {};

  stateGetters.forEach((getter, id) => {
    try {
      const state = getter();
      Object.entries(state).forEach(([key, value]) => {
        states[`${id}.${key}`] = value;
      });
    } catch (e) {
      // Ignore errors from unmounted components
    }
  });

  currentSession.snapshots.push({
    timestamp: now,
    elapsed: now - currentSession.startTime,
    states
  });
  notifyListeners();
}

export function startTimingSession(label: string = 'session') {
  stopTimingSession();

  currentSession = {
    id: `${label}-${Date.now()}`,
    label,
    startTime: Date.now(),
    snapshots: [],
    events: []
  };

  // Take snapshot every 100ms
  snapshotInterval = setInterval(takeSnapshot, 100);
  takeSnapshot(); // Initial snapshot
  notifyListeners();

  console.log(`[TIMING] Session started: ${currentSession.id}`);
}

export function stopTimingSession(): TimingSession | null {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
  }

  const session = currentSession;
  if (session) {
    console.log(
      `[TIMING] Session ended: ${session.id}, ${session.snapshots.length} snapshots, ${session.events.length} events`
    );
  }
  currentSession = null;
  notifyListeners();
  return session;
}

export async function saveTimingSession(session: TimingSession): Promise<string | null> {
  try {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const user = userRes?.user;
    if (!user) return null;

    const endTime = Date.now();

    const payload = {
      user_id: user.id,
      label: session.label,
      start_time: new Date(session.startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      duration_ms: endTime - session.startTime,
      app_route: typeof window !== 'undefined' ? window.location.pathname : null,
      events: session.events,
      snapshots: session.snapshots,
      client_info: {
        clientSessionId: session.id,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      }
    };

    const { data, error } = await (supabase as any)
      .from('timing_debug_sessions')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.warn('[TIMING] Failed to save timing session', e);
    return null;
  }
}

export async function stopAndSaveTimingSession(): Promise<{ session: TimingSession | null; savedId: string | null }> {
  const session = stopTimingSession();
  if (!session) return { session: null, savedId: null };
  const savedId = await saveTimingSession(session);
  return { session, savedId };
}

export function getCurrentSession(): TimingSession | null {
  return currentSession;
}

export function useDiceTimingDebug(componentId: string) {
  const getStateRef = useRef<() => Record<string, string | number | boolean>>(() => ({}));

  useEffect(() => {
    const cleanup = registerStateGetter(componentId, () => getStateRef.current());
    return () => {
      cleanup();
    };
  }, [componentId]);

  const setStateGetter = useCallback((getter: () => Record<string, string | number | boolean>) => {
    getStateRef.current = getter;
  }, []);

  const logEvent = useCallback(
    (event: string) => {
      logTimingEvent(`[${componentId}] ${event}`);
    },
    [componentId]
  );

  return { setStateGetter, logEvent };
}

export function useTimingSession() {
  const [session, setSession] = useState<TimingSession | null>(currentSession);

  useEffect(() => {
    const update = () => setSession(currentSession ? { ...currentSession } : null);
    sessionListeners.add(update);
    return () => {
      sessionListeners.delete(update);
    };
  }, []);

  return {
    session,
    isActive: !!session,
    start: startTimingSession,
    stop: stopTimingSession,
    stopAndSave: stopAndSaveTimingSession
  };
}

