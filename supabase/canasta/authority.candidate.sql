-- LOCAL CANDIDATE ONLY. No migration, registration, publication, or activation.
-- Same private reducer/CAS boundary as Run21. Client roles cannot submit state.
CREATE TABLE private.canasta_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,admission_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.canasta_release DEFAULT VALUES;
CREATE TABLE private.canasta_matches(
 dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),game_id uuid NOT NULL REFERENCES public.games(id),
 first_round_id uuid NOT NULL REFERENCES public.rounds(id),state jsonb NOT NULL,revision bigint NOT NULL,
 stake integer NOT NULL CHECK(stake>0),seats jsonb NOT NULL CHECK(jsonb_array_length(seats)=2),
 settlement jsonb,finished boolean NOT NULL DEFAULT false,bot_due_at bigint,
 CHECK(state->>'version'='canasta-classic-two/1')
);
CREATE TABLE private.canasta_receipts(dealer_game_id uuid NOT NULL REFERENCES private.canasta_matches(dealer_game_id),request_id uuid NOT NULL,
 actor uuid NOT NULL,command jsonb NOT NULL,revision bigint NOT NULL,PRIMARY KEY(dealer_game_id,request_id));
ALTER TABLE private.canasta_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.canasta_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.canasta_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.canasta_release,private.canasta_matches,private.canasta_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX canasta_due ON private.canasta_matches(((state#>>'{hand,deadline}')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE FUNCTION public.canasta_server_load(p_match uuid,p_user uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.canasta_matches;g public.games;humans jsonb;
BEGIN
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF NOT EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled) THEN RAISE EXCEPTION 'canasta:closed';END IF;
 IF p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=p_user AND NOT p.is_bot AND p.status<>'left'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text AND s->>'userId'=p_user::text)) THEN RAISE EXCEPTION 'canasta:unauthorized' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(p.id),'[]'::jsonb) INTO humans FROM public.players p WHERE p.game_id=m.game_id AND NOT p.is_bot AND p.status='active'
  AND NOT p.sitting_out AND NOT p.auto_fold AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text);
 RETURN jsonb_build_object('state',m.state,'firstRoundId',m.first_round_id,'activeHumans',humans,'botDue',m.bot_due_at,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),
  'finished',m.finished,'settlement',m.settlement);
END $$;

CREATE FUNCTION public.canasta_server_commit(p_match uuid,p_revision bigint,p_state jsonb,p_context jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.canasta_matches;g public.games;at_ms bigint;actor uuid;command jsonb;request uuid;prior private.canasta_receipts;
 winner uuid;loser uuid;result_id uuid;batch_id uuid;changes jsonb;scores jsonb;first_hand uuid;automatic_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match;
 -- Preserve canonical lock order: round, game, private match, participants.
 PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match FOR UPDATE;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF NOT EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled) THEN RAISE EXCEPTION 'canasta:closed';END IF;
 IF p_context->>'kind' NOT IN('command','recover','control') THEN RAISE EXCEPTION 'canasta:context';END IF;
 IF p_context->>'kind'<>'recover' THEN
  actor:=(p_context->>'userId')::uuid;
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor AND NOT p.is_bot AND p.status<>'left'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text AND s->>'userId'=actor::text)) THEN RAISE EXCEPTION 'canasta:unauthorized' USING ERRCODE='42501';END IF;
 END IF;
 IF p_context->>'kind'='command' THEN
  command:=p_context->'command';request:=(command->>'requestId')::uuid;
  IF request IS NULL OR command->>'matchId' IS DISTINCT FROM p_match::text OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s
    WHERE s->>'id'=command->>'playerId' AND s->>'userId'=actor::text) THEN RAISE EXCEPTION 'canasta:command_identity';END IF;
  SELECT * INTO prior FROM private.canasta_receipts WHERE dealer_game_id=p_match AND request_id=request;
  IF FOUND THEN
   IF prior.actor<>actor OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'canasta:receipt_conflict';END IF;
   RETURN public.canasta_server_load(p_match,actor);
  END IF;
 END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'canasta:conflict';END IF;
 IF m.finished OR m.settlement IS NOT NULL OR g.current_game_uuid IS DISTINCT FROM p_match OR g.game_type IS DISTINCT FROM 'canasta'
  OR g.status<>'in_progress' THEN RAISE EXCEPTION 'canasta:inactive';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=p_match AND session_id=m.game_id AND (config->>'ante_amount')::integer=m.stake)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id=(s->>'id')::uuid AND p.game_id=m.game_id
    AND p.is_bot=(s->>'kind'='bot') AND (p.is_bot OR p.user_id=(s->>'userId')::uuid))) THEN RAISE EXCEPTION 'canasta:frozen_identity';END IF;
 IF g.is_paused AND p_context->>'kind'<>'control' THEN RAISE EXCEPTION 'canasta:paused';END IF;
 IF p_context->>'kind'='recover' AND nullif(p_state->'pause','null'::jsonb) IS NULL
  AND (p_state->'automatic') ? (m.state#>>'{hand,active}')
  AND (g.real_money OR NOT EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=m.game_id AND NOT p.is_bot AND p.status='active'
    AND NOT p.sitting_out AND NOT p.auto_fold AND p.id::text<>m.state#>>'{hand,active}'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text))) THEN RAISE EXCEPTION 'canasta:conflict';END IF;
 IF command IS NOT NULL THEN
  IF command->>'handId' IS DISTINCT FROM m.state#>>'{hand,id}' OR command->>'turn' IS DISTINCT FROM m.state#>>'{hand,turn}'
   OR command->>'generation' IS DISTINCT FROM m.state#>>'{hand,generation}' OR command->>'playerId' IS DISTINCT FROM m.state#>>'{hand,active}'
   OR (command->>'revision')::bigint<>m.revision THEN RAISE EXCEPTION 'canasta:stale_command';END IF;
  -- Fresh time AFTER row locks. Equality expires; a completed receipt returned above wins.
  IF at_ms>=(m.state#>>'{hand,deadline}')::bigint THEN RAISE EXCEPTION 'canasta:deadline';END IF;
 END IF;
 IF p_state->>'id' IS DISTINCT FROM p_match::text OR p_state->>'sessionId' IS DISTINCT FROM m.game_id::text
  OR p_state->>'version' IS DISTINCT FROM 'canasta-classic-two/1' OR p_state->'seats' IS DISTINCT FROM m.seats
  OR (p_state->>'stake')::integer IS DISTINCT FROM m.stake OR (p_state->>'realMoney')::boolean IS DISTINCT FROM g.real_money
  OR (p_state->>'revision')::bigint<=m.revision THEN RAISE EXCEPTION 'canasta:state_identity';END IF;
 -- A newly admitted turn receives its whole budget at database commit; other actions never reset it.
 IF p_state#>>'{hand,id}' IS DISTINCT FROM m.state#>>'{hand,id}' OR p_state#>>'{hand,turn}' IS DISTINCT FROM m.state#>>'{hand,turn}' THEN
  p_state:=jsonb_set(p_state,'{hand,deadline}',to_jsonb(at_ms+120000));
 END IF;
 p_state:=jsonb_set(p_state,'{updatedAt}',to_jsonb(at_ms));
 IF p_state#>>'{hand,id}' IS NOT NULL THEN
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
   VALUES((p_state#>>'{hand,id}')::uuid,m.game_id,p_match,1,(p_state#>>'{hand,number}')::integer,0,'betting',0) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=(p_state#>>'{hand,id}')::uuid AND game_id=m.game_id AND dealer_game_id=p_match AND hand_number=1
    AND round_number=(p_state#>>'{hand,number}')::integer) THEN RAISE EXCEPTION 'canasta:round_identity';END IF;
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=p_match AND id IN(SELECT (h->>'id')::uuid FROM jsonb_array_elements(p_state->'completed') h);
  UPDATE public.games SET current_round=(p_state#>>'{hand,number}')::integer WHERE id=m.game_id;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE
   (SELECT coalesce(sum((r->'scores'->>(s->>'id'))::bigint),0) FROM jsonb_array_elements(p_state->'completed') r)
    IS DISTINCT FROM (p_state->'totals'->>(s->>'id'))::bigint) THEN RAISE EXCEPTION 'canasta:score_totals';END IF;
 winner:=nullif(p_state->>'winner','')::uuid;
 IF winner IS NOT NULL THEN
  SELECT (s->>'id')::uuid INTO STRICT loser FROM jsonb_array_elements(m.seats) s WHERE s->>'id'<>winner::text;
  IF p_state#>>'{hand,phase}' IS DISTINCT FROM 'complete' OR (p_state->'totals'->>winner::text)::bigint<5000
   OR (p_state->'totals'->>winner::text)::bigint<=(p_state->'totals'->>loser::text)::bigint THEN RAISE EXCEPTION 'canasta:winner';END IF;
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND id IN(winner,loser))<>2
   OR (g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE id IN(winner,loser) AND is_bot)) THEN RAISE EXCEPTION 'canasta:participants';END IF;
  result_id:=gen_random_uuid();changes:=jsonb_build_object(winner::text,m.stake,loser::text,-m.stake);
  INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
   VALUES(result_id,m.game_id,p_match,1,'canasta_terminal','canasta',winner,
    (SELECT coalesce(pr.username,'Player') FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.id=winner),
    'Canasta: '||(p_state->'totals')::text,m.stake,changes,false);
  PERFORM public.settle_gameplay_chip_transfers(m.game_id,jsonb_build_array(jsonb_build_object(
    'from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',m.stake)),'win');
  SET CONSTRAINTS public.gameplay_transfer_pending_finalize IMMEDIATE;
  SELECT id INTO STRICT batch_id FROM public.gameplay_transfer_batches WHERE game_id=m.game_id AND dealer_game_id=p_match
    AND cursor=(SELECT chip_transfer_cursor FROM public.games WHERE id=m.game_id);
  SET CONSTRAINTS public.gameplay_transfer_pending_finalize DEFERRED;
  INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
   SELECT p.game_id,p_match,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
   WHERE p.game_id=m.game_id ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO NOTHING;
  m.settlement:=jsonb_build_object('key','canasta:'||p_match,'resultId',result_id,'transferBatchId',batch_id,'winner',winner,'loser',loser,'amount',m.stake,'scores',p_state->'totals','startedAt',at_ms,'deadline',at_ms+3000);
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=p_match;
  UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
    session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,
    pending_session_end=false,game_over_at=clock_timestamp(),last_round_result='Canasta complete',awaiting_next_round=false WHERE id=m.game_id;
 END IF;
 UPDATE private.canasta_matches SET state=p_state,revision=(p_state->>'revision')::bigint,settlement=m.settlement,
   bot_due_at=CASE WHEN (EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p_state#>>'{hand,active}' AND s->>'kind'='bot')
     OR (p_state->'automatic') ? (p_state#>>'{hand,active}'))
     AND p_state->'pause'='null'::jsonb AND p_state#>>'{hand,phase}'<>'complete' THEN at_ms+750 END WHERE dealer_game_id=p_match;
 -- Project automatic status through canonical player controls; no participant is removed between hands.
 UPDATE public.players p SET auto_fold=EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_state->'automatic') a WHERE a=p.id::text),
   sit_out_next_hand=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_state->'automatic') a WHERE a=p.id::text) THEN true ELSE p.sit_out_next_hand END
  WHERE p.game_id=m.game_id AND NOT p.is_bot AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text);
 IF nullif(p_state->'pause','null'::jsonb) IS NOT NULL AND NOT g.is_paused THEN
  IF g.real_money AND p_state#>>'{pause,reason}'='inactivity' THEN UPDATE public.players SET sitting_out=true,sit_out_next_hand=true WHERE id=(p_state#>>'{hand,active}')::uuid;END IF;
  PERFORM public.set_game_paused(g.id,true,p_match,g.pause_version);
 END IF;
 IF command IS NOT NULL THEN INSERT INTO private.canasta_receipts VALUES(p_match,request,actor,command,(p_state->>'revision')::bigint);END IF;
 RETURN public.canasta_server_load(p_match,actor);
END $$;
REVOKE ALL ON FUNCTION public.canasta_server_load(uuid,uuid),public.canasta_server_commit(uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.canasta_server_load(uuid,uuid),public.canasta_server_commit(uuid,bigint,jsonb,jsonb) TO service_role;
