CREATE TABLE IF NOT EXISTS public.three_five_seven_force_deal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  target_player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  target_cards jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_dealer_game_id uuid,
  consumed_round_id uuid,
  consumed_hand_number integer
);
CREATE UNIQUE INDEX IF NOT EXISTS three_five_seven_force_deal_pending_uidx
  ON public.three_five_seven_force_deal (game_id)
  WHERE consumed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.three_five_seven_force_deal TO authenticated;
GRANT ALL ON public.three_five_seven_force_deal TO service_role;
ALTER TABLE public.three_five_seven_force_deal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "357 force-deal: admin select" ON public.three_five_seven_force_deal FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "357 force-deal: admin insert" ON public.three_five_seven_force_deal FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "357 force-deal: admin update" ON public.three_five_seven_force_deal FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "357 force-deal: admin delete" ON public.three_five_seven_force_deal FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
