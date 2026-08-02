CREATE TABLE public.visual_bug_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reporter_user_id uuid NOT NULL,
  bug_type text NOT NULL,
  bug_label text NOT NULL,
  note text,
  game_id uuid NOT NULL,
  dealer_game_id uuid,
  round_id uuid,
  hand_number integer,
  phase text,
  current_turn_player_id uuid,
  viewer_player_id uuid,
  active_tab text,
  platform_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra_context jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.visual_bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own bug reports"
  ON public.visual_bug_reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "Users can view own bug reports"
  ON public.visual_bug_reports
  FOR SELECT
  USING (auth.uid() = reporter_user_id);

CREATE POLICY "Admins can view all bug reports"
  ON public.visual_bug_reports
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_visual_bug_reports_game ON public.visual_bug_reports (game_id);
CREATE INDEX idx_visual_bug_reports_type ON public.visual_bug_reports (bug_type);
CREATE INDEX idx_visual_bug_reports_created ON public.visual_bug_reports (created_at DESC);
