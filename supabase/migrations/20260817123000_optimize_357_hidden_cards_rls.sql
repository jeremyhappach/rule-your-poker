-- Cache auth.uid() once per statement in the restrictive 3-5-7 hidden-card
-- policy. This preserves the authority boundary while avoiding a per-row auth
-- function initialization plan.

DROP POLICY IF EXISTS three_five_seven_hidden_cards_select ON public.player_cards;
CREATE POLICY three_five_seven_hidden_cards_select
ON public.player_cards
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT EXISTS (
    SELECT 1 FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
    WHERE round_row.id=player_cards.round_id
      AND game_row.game_type IN ('3-5-7','3-5-7-game','357')
  )
  OR coalesce(player_cards.is_public,false)
  OR EXISTS (
    SELECT 1 FROM public.players owner
    JOIN public.rounds round_row ON round_row.game_id=owner.game_id
    WHERE round_row.id=player_cards.round_id
      AND owner.id=player_cards.player_id
      AND owner.user_id=(SELECT auth.uid())
  )
  OR public.has_role((SELECT auth.uid()),'admin'::public.app_role)
);
