CREATE OR REPLACE FUNCTION public.run21_server_commit(p_dealer_game_id uuid, p_expected_revision bigint, p_state jsonb, p_bot_due_at bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE m private.run21_matches; g public.games; last_round jsonb; receipt jsonb; winner uuid; loser uuid; batch uuid; changes jsonb;
 timeout_event jsonb; timed_out uuid;
BEGIN
  PERFORM private.run21_require_local();
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
  IF (g.real_money AND m.financial_version<>2) OR g.is_paused OR g.status NOT IN ('in_progress','game_over') OR g.game_type IS DISTINCT FROM 'run21' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR m.finished THEN
    RAISE EXCEPTION 'run21:inactive_identity'; END IF;
  IF m.revision<>p_expected_revision THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision); END IF;
  IF p_state#>>'{identity,sessionId}' IS DISTINCT FROM m.game_id::text OR p_state#>>'{identity,dealerGameId}' IS DISTINCT FROM m.dealer_game_id::text
    OR p_state#>>'{identity,handNumber}' IS DISTINCT FROM '1' OR p_state->>'stake' IS DISTINCT FROM m.stake::text
    OR jsonb_array_length(p_state->'players')<>2 OR jsonb_array_length(p_state->'rounds')<1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_state->'players') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p->>'id'))
    OR (m.state IS NOT NULL AND (p_state->'config' IS DISTINCT FROM m.state->'config' OR (p_state->>'updatedAt')::bigint<(m.state->>'updatedAt')::bigint)) THEN
    RAISE EXCEPTION 'run21:commit_identity'; END IF;
  last_round:=p_state->'rounds'->-1;
  SELECT e INTO timeout_event FROM jsonb_array_elements(p_state->'events') e
    WHERE e->>'type'='first_placement_timeout' AND (e->>'sequence')::bigint>m.event_sequence LIMIT 1;
  IF timeout_event IS NOT NULL THEN
    timed_out:=(timeout_event->>'actorId')::uuid;
    IF m.financial_version<>2 OR m.state#>>'{rounds,-1,active_player_id}' IS DISTINCT FROM timed_out::text
      OR m.state#>>ARRAY['rounds','-1','boards',timed_out::text,'startedAt'] IS NOT NULL
      OR (m.state#>>ARRAY['rounds','-1','boards',timed_out::text,'firstPlacementDeadline'])::bigint IS NULL
      OR (m.state#>>ARRAY['rounds','-1','boards',timed_out::text,'firstPlacementDeadline'])::bigint>floor(extract(epoch FROM clock_timestamp())*1000)
      OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=timed_out AND game_id=m.game_id AND NOT is_bot) THEN
      RAISE EXCEPTION 'run21:timeout_identity';
    END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=(last_round->>'id')::uuid) THEN
    INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
      VALUES((last_round->>'id')::uuid,g.id,m.dealer_game_id,1,(last_round->>'number')::integer,0,'betting',0);
  END IF;
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=m.dealer_game_id
    AND id IN(SELECT (r->>'id')::uuid FROM jsonb_array_elements(p_state->'rounds') r WHERE (r->>'revealed')::boolean) AND status<>'completed';
  UPDATE public.games SET current_round=(last_round->>'number')::integer WHERE id=g.id AND current_round IS DISTINCT FROM (last_round->>'number')::integer;
  receipt:=nullif(p_state->'settlement','null'::jsonb);
  IF receipt IS NOT NULL THEN
    winner:=(receipt->>'winnerId')::uuid;loser:=(receipt->>'loserId')::uuid;
    IF receipt->>'key' IS DISTINCT FROM 'run21:'||m.dealer_game_id||':1' OR receipt->>'winnerId' IS DISTINCT FROM p_state->>'winnerId'
      OR receipt->>'amount' IS DISTINCT FROM m.stake::text OR winner=loser OR m.initial_balances->>winner::text IS NULL OR m.initial_balances->>loser::text IS NULL
      OR (last_round->>'number')::integer<3 OR NOT(last_round->>'revealed')::boolean
      OR (p_state#>>ARRAY['cumulative',winner::text])::bigint<=(p_state#>>ARRAY['cumulative',loser::text])::bigint THEN
      RAISE EXCEPTION 'run21:settlement_identity'; END IF;
    IF m.financial_version=2 AND NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id) THEN
      PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
      IF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND id IN (winner,loser))<>2
        OR (g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE game_id=m.game_id AND id IN(winner,loser) AND is_bot)) THEN
        RAISE EXCEPTION 'run21:financial_participants';
      END IF;
      -- The trusted reducer supplies scores; independently require complete totals for every round.
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE
        (SELECT sum((r#>>ARRAY['boards',p->>'id','result','score'])::bigint) FROM jsonb_array_elements(p_state->'rounds') r)
          IS DISTINCT FROM (p_state#>>ARRAY['cumulative',p->>'id'])::bigint)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_state->'rounds') r, jsonb_array_elements(m.participants) p
          WHERE r#>ARRAY['boards',p->>'id','result'] IS NULL OR r#>ARRAY['boards',p->>'id','result']='null'::jsonb OR r->>'revealed' IS DISTINCT FROM 'true') THEN
        RAISE EXCEPTION 'run21:incomplete_scores';
      END IF;
      changes:=jsonb_build_object(winner::text,m.stake,loser::text,-m.stake);
      INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
      VALUES((receipt->>'resultId')::uuid,m.game_id,m.dealer_game_id,1,'run21_terminal','run21',winner,
        (SELECT p->>'name' FROM jsonb_array_elements(m.participants) p WHERE p->>'id'=winner::text),
        'Run21: '||(p_state->'cumulative')::text,m.stake,changes,false);
      PERFORM public.settle_gameplay_chip_transfers(m.game_id,jsonb_build_array(jsonb_build_object(
        'from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',m.stake)),'win');
      -- Materialize the existing deferred journal, retaining its generated immutable identity.
      SET CONSTRAINTS public.gameplay_transfer_pending_finalize IMMEDIATE;
      SELECT id INTO STRICT batch FROM public.gameplay_transfer_batches
        WHERE game_id=m.game_id AND dealer_game_id=m.dealer_game_id AND cursor=(SELECT chip_transfer_cursor FROM public.games WHERE id=m.game_id);
      SET CONSTRAINTS public.gameplay_transfer_pending_finalize DEFERRED;
      receipt:=jsonb_set(receipt,'{transferBatchId}',to_jsonb(batch::text));
      p_state:=jsonb_set(p_state,'{settlement}',receipt);
      p_state:=jsonb_set(p_state,'{events}',(SELECT jsonb_agg(CASE WHEN e->>'type'='settlement_recorded'
        THEN jsonb_set(jsonb_set(e,'{operands,receipt}',receipt),'{frame,settlement}',receipt) ELSE e END ORDER BY n)
        FROM jsonb_array_elements(p_state->'events') WITH ORDINALITY AS x(e,n)));
      INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
      SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1
        FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
      ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
    END IF;
    INSERT INTO private.run21_settlements(id,transfer_batch_id,dealer_game_id,settlement_key,winner_id,loser_id,amount)
      VALUES((receipt->>'resultId')::uuid,(receipt->>'transferBatchId')::uuid,m.dealer_game_id,receipt->>'key',winner,loser,m.stake)
      ON CONFLICT(dealer_game_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id AND id=(receipt->>'resultId')::uuid AND transfer_batch_id=(receipt->>'transferBatchId')::uuid AND winner_id=winner AND loser_id=loser AND amount=m.stake) THEN
      RAISE EXCEPTION 'run21:settlement_conflict'; END IF;
    m.balances:=jsonb_set(jsonb_set(m.initial_balances,ARRAY[winner::text],to_jsonb((m.initial_balances->>winner::text)::numeric+m.stake)),ARRAY[loser::text],to_jsonb((m.initial_balances->>loser::text)::numeric-m.stake));
    IF m.financial_version=2 THEN
      SELECT jsonb_object_agg(p.id,p.chips) INTO m.balances FROM public.players p WHERE p.game_id=m.game_id
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p.id::text);
      UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
        session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,
        pending_session_end=false,game_over_at=clock_timestamp(),last_round_result='Run21 complete',awaiting_next_round=false WHERE id=m.game_id;
    END IF;
  ELSIF m.state->'settlement' IS NOT NULL AND m.state->'settlement'<>'null'::jsonb THEN
    RAISE EXCEPTION 'run21:settlement_cannot_regress';
  END IF;
  UPDATE private.run21_matches SET state=p_state,revision=revision+1,bot_due_at=p_bot_due_at,balances=m.balances
    WHERE dealer_game_id=m.dealer_game_id RETURNING * INTO m;
  IF timeout_event IS NOT NULL THEN
    UPDATE public.players SET auto_fold=NOT g.real_money,sit_out_next_hand=true,
      sitting_out=CASE WHEN g.real_money THEN true ELSE sitting_out END WHERE id=timed_out AND game_id=m.game_id;
    IF g.real_money AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=g.id AND is_paused) THEN
      RAISE EXCEPTION 'run21:timeout_pause_failed';
    END IF;
    SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  END IF;
  RETURN jsonb_build_object('outcome','committed','record',CASE WHEN p_state ? 'eventSequence' THEN
    jsonb_set(to_jsonb(m),'{state,events}',p_state->'events') ELSE
    jsonb_set(to_jsonb(m),'{state,events}',p_state->'events') #- '{state,eventSequence}' END);
END $function$
