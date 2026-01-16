-- Create table for performance traces
CREATE TABLE public.performance_traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  operation TEXT NOT NULL,
  table_name TEXT,
  duration_ms INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for trace sessions
CREATE TABLE public.trace_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT DEFAULT 'trace',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  total_operations INTEGER DEFAULT 0,
  slowest_operation_ms INTEGER DEFAULT 0,
  avg_duration_ms NUMERIC DEFAULT 0,
  game_id UUID
);

-- Enable RLS
ALTER TABLE public.performance_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trace_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for performance_traces
CREATE POLICY "Users can insert own traces" ON public.performance_traces
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own traces" ON public.performance_traces
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own traces" ON public.performance_traces
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for trace_sessions
CREATE POLICY "Users can insert own trace sessions" ON public.trace_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own trace sessions" ON public.trace_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own trace sessions" ON public.trace_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trace sessions" ON public.trace_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_performance_traces_session ON public.performance_traces(session_id);
CREATE INDEX idx_performance_traces_created ON public.performance_traces(created_at DESC);