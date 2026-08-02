
CREATE TABLE public.cribbage_hand_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_game_id uuid NOT NULL,
  hand_number integer NOT NULL,
  game_id uuid NOT NULL,
  round_id uuid,
  dealer_player_id uuid,
  cut_card jsonb,
  dealt_hands jsonb NOT NULL DEFAULT '{}'::jsonb,
  crib jsonb,
  hand_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  peg_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  cribbage_state jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cribbage_hand_archive_unique_hand UNIQUE (dealer_game_id, hand_number)
);

CREATE INDEX idx_cribbage_hand_archive_dealer_game ON public.cribbage_hand_archive (dealer_game_id, hand_number);
CREATE INDEX idx_cribbage_hand_archive_archived_at ON public.cribbage_hand_archive (archived_at DESC);

ALTER TABLE public.cribbage_hand_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert hand archive"
  ON public.cribbage_hand_archive
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view hand archive"
  ON public.cribbage_hand_archive
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
