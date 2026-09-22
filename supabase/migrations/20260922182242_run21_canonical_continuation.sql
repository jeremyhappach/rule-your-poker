-- Run21-only continuation after its immutable settlement receipt.
-- Uses the established canonical participation/dealer policy; no other game owner changes.
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.run21_server_close(uuid,uuid)'::regprocedure)) <> '5da5f99c773d5be6f4f104847c81c2ef' THEN RAISE EXCEPTION 'run21:close_definition_drift'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.run21_server_close(p_dealer_game_id uuid,p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $run21$
DECLARE
 m private.run21_matches; g public.games; winner uuid;
 active_count integer; human_count integer; eligible_count integer;
 allow_bots boolean:=false; make_take boolean:=false; positions integer[];
 next_position integer; target text; deadline timestamptz;
BEGIN
 PERFORM private.run21_require_local();
 IF NOT public.run21_server_authorize(p_user_id) THEN
  RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'userId'=p_user_id::text AND p->>'kind'='human')
 OR NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id) THEN
  RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
 IF m.finished THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.real_money IS DISTINCT FROM false OR g.game_type IS DISTINCT FROM 'run21' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id THEN
  RAISE EXCEPTION 'run21:inactive_identity'; END IF;
 SELECT winner_id INTO STRICT winner FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->'settlement' IS NULL OR m.state->'settlement'='null'::jsonb OR m.state->>'winnerId' IS DISTINCT FROM winner::text THEN
  RAISE EXCEPTION 'run21:not_settled'; END IF;
 IF g.status='session_ended' THEN
  target:='session_ended';
 ELSE
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET
   status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false
  WHERE game_id=m.game_id;
  SELECT count(*),count(*) FILTER(WHERE NOT is_bot) INTO active_count,human_count FROM public.players
   WHERE game_id=m.game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
  -- Same session-level dealer policy source as Yahtzee; no game scoring defaults.
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm';
  allow_bots:=coalesce(allow_bots,false);
  SELECT array_agg(position ORDER BY position DESC),count(*) INTO positions,eligible_count FROM public.players
   WHERE game_id=m.game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL
    AND (allow_bots OR NOT is_bot);
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF human_count=0 OR active_count<2 OR eligible_count=0 THEN
   -- Canonical participant admission distinguishes seated/sitting-out humans
   -- from a truly ended session and preserves its financial finalization rules.
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());
   SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT position INTO next_position FROM public.players WHERE id=winner AND game_id=m.game_id
     AND NOT is_bot AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
    IF next_position IS NULL THEN
     IF eligible_count=1 THEN next_position:=positions[1]; ELSE target:='dealer_selection'; END IF;
    END IF;
   END IF;
   IF target IS NULL THEN
    IF next_position IS NULL THEN
     -- Canonical clockwise is next LOWER occupied position, wrapping.
     SELECT max(p) INTO next_position FROM unnest(positions) p WHERE p<g.dealer_position;
     next_position:=coalesce(next_position,positions[1]);
    END IF;
    target:='game_selection';
    deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.game_setup_timer_seconds,30)));
   END IF;
  END IF;
  -- No dealer game is committed in canonical setup/waiting. Retire only the
  -- live family discriminator; immutable dealer-game/round/history keep Run21.
  -- A later setup timer has its own transaction and must use canonical authority,
  -- never a prior game claim from this continuation. Ended frames retain it.
  UPDATE public.games SET status=target,
   game_type=CASE WHEN target IN ('game_selection','dealer_selection','waiting') THEN NULL ELSE game_type END,
   config_complete=false,config_deadline=deadline,ante_decision_deadline=NULL,
   last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,pot=0,
   all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,buck_position=NULL,total_hands=0,
   is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
   dealer_position=CASE WHEN target='game_selection' THEN next_position ELSE dealer_position END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
  WHERE id=m.game_id;
 END IF;
 UPDATE private.run21_matches SET finished=true WHERE dealer_game_id=m.dealer_game_id;
END $run21$;
-- CREATE OR REPLACE preserves the existing owner and service-role-only grants.
