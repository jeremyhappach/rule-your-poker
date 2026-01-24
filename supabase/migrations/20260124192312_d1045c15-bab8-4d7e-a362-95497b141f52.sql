-- Dice position snapshot tracing (debug)

CREATE TABLE IF NOT EXISTS public.dice_trace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NULL,
  game_id uuid NULL,
  round_id uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone NULL
);

ALTER TABLE public.dice_trace_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own dice trace sessions"
ON public.dice_trace_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own dice trace sessions"
ON public.dice_trace_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own dice trace sessions"
ON public.dice_trace_sessions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dice trace sessions"
ON public.dice_trace_sessions
FOR DELETE
USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.dice_trace_samples (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.dice_trace_sessions(id) ON DELETE CASCADE,
  t_ms bigint NOT NULL,
  frame_seq integer NOT NULL,
  cache_key text NULL,
  roll_key text NULL,
  die_index integer NOT NULL,
  die_value integer NULL,
  die_is_held boolean NOT NULL,
  die_is_held_in_layout boolean NULL,
  is_observer boolean NULL,
  is_rolling boolean NULL,
  is_animating_fly_in boolean NULL,
  x double precision NULL,
  y double precision NULL,
  w double precision NULL,
  h double precision NULL,
  container_w double precision NULL,
  container_h double precision NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dice_trace_samples_session_frame_idx
ON public.dice_trace_samples(session_id, frame_seq);

CREATE INDEX IF NOT EXISTS dice_trace_samples_session_time_idx
ON public.dice_trace_samples(session_id, t_ms);

ALTER TABLE public.dice_trace_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert dice trace samples for their sessions"
ON public.dice_trace_samples
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dice_trace_sessions s
    WHERE s.id = dice_trace_samples.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view dice trace samples for their sessions"
ON public.dice_trace_samples
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.dice_trace_sessions s
    WHERE s.id = dice_trace_samples.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete dice trace samples for their sessions"
ON public.dice_trace_samples
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.dice_trace_sessions s
    WHERE s.id = dice_trace_samples.session_id
      AND s.user_id = auth.uid()
  )
);