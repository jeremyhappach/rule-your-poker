import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  startTrace, 
  stopTrace, 
  isTracing, 
  getTraceSessionId 
} from '@/lib/performanceTracer';
import { Circle, Square, Eye, X, Activity } from 'lucide-react';

interface TraceSession {
  id: string;
  label: string;
  started_at: string;
  ended_at: string | null;
  total_operations: number;
  slowest_operation_ms: number;
  avg_duration_ms: number;
  game_id: string | null;
}

interface TraceEntry {
  id: string;
  operation: string;
  table_name: string | null;
  duration_ms: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function PerformanceTracerPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [recording, setRecording] = useState(isTracing());
  const [sessions, setSessions] = useState<TraceSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  const fetchSessions = async () => {
    const { data } = await supabase
      .from('trace_sessions' as any)
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    
    setSessions((data as unknown as TraceSession[]) || []);
  };

  const fetchTraces = async (sessionId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('performance_traces' as any)
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    
    setTraces((data as unknown as TraceEntry[]) || []);
    setLoading(false);
  };

  const handleStartRecording = async () => {
    const sessionId = await startTrace('manual-trace');
    if (sessionId) {
      setRecording(true);
    }
  };

  const handleStopRecording = async () => {
    await stopTrace();
    setRecording(false);
    fetchSessions();
  };

  const handleViewSession = (sessionId: string) => {
    setSelectedSession(sessionId);
    fetchTraces(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await supabase.from('performance_traces' as any).delete().eq('session_id', sessionId);
    await supabase.from('trace_sessions' as any).delete().eq('id', sessionId);
    fetchSessions();
    if (selectedSession === sessionId) {
      setSelectedSession(null);
      setTraces([]);
    }
  };

  const getDurationColor = (ms: number) => {
    if (ms > 1000) return 'text-red-500 font-bold';
    if (ms > 500) return 'text-orange-500';
    if (ms > 200) return 'text-yellow-500';
    return 'text-green-500';
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-background border border-border rounded-full p-3 shadow-lg hover:bg-muted transition-colors"
        title="Performance Tracer"
      >
        <Activity className={`w-5 h-5 ${recording ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[500px] max-h-[600px] bg-background border border-border rounded-lg shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" />
          <span className="font-semibold text-sm">Performance Tracer</span>
          {recording && (
            <Badge variant="destructive" className="animate-pulse">
              Recording
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {recording ? (
            <Button size="sm" variant="destructive" onClick={handleStopRecording}>
              <Square className="w-3 h-3 mr-1" /> Stop
            </Button>
          ) : (
            <Button size="sm" variant="default" onClick={handleStartRecording}>
              <Circle className="w-3 h-3 mr-1 text-red-500" /> Record
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {selectedSession ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setSelectedSession(null)}>
                ← Back to sessions
              </Button>
              <span className="text-xs text-muted-foreground">
                {traces.length} operations
              </span>
            </div>

            {loading ? (
              <div className="text-center text-muted-foreground py-4">Loading...</div>
            ) : (
              <div className="space-y-1 text-xs font-mono">
                {traces.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-start gap-2 p-1.5 rounded bg-muted/50 hover:bg-muted"
                  >
                    <span className="text-muted-foreground w-6">{i + 1}</span>
                    <span className={`w-16 text-right ${getDurationColor(t.duration_ms)}`}>
                      {t.duration_ms}ms
                    </span>
                    <span className="text-primary">{t.operation}</span>
                    {t.table_name && (
                      <span className="text-muted-foreground">({t.table_name})</span>
                    )}
                    {t.metadata && Object.keys(t.metadata).length > 0 && (
                      <span className="text-muted-foreground truncate max-w-[150px]" title={JSON.stringify(t.metadata)}>
                        {JSON.stringify(t.metadata)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">
              Recent Sessions
            </h3>
            {sessions.length === 0 ? (
              <div className="text-center text-muted-foreground py-4 text-sm">
                No trace sessions yet. Click Record to start.
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted text-sm"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{s.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.started_at).toLocaleString()} •{' '}
                        {s.total_operations} ops •{' '}
                        <span className={getDurationColor(s.slowest_operation_ms)}>
                          max {s.slowest_operation_ms}ms
                        </span>{' '}
                        • avg {s.avg_duration_ms}ms
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewSession(s.id)}
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSession(s.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
