-- Exercise only this transaction's fake-money table, including the real financial triggers.
BEGIN;
SET LOCAL statement_timeout = '20s';
DO $proof$
DECLARE
  g uuid := gen_random_uuid(); dg uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  successor uuid; a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); users uuid[];
  s jsonb; result jsonb; first_release text; initial_start text; pause_receipt jsonb;
  source_round uuid; normal jsonb; v integer; i integer;
BEGIN
  SELECT array_agg(id) INTO users FROM (SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE NOT p.is_superuser ORDER BY p.id LIMIT 2) u;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,current_round,total_hands,is_first_hand,ante_amount,pot,real_money,points_to_win)
  VALUES(g,'Rollback Cribbage counting clock','in_progress','cribbage',dg,users[1],2,1,1,false,1,0,false,121);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(dg,g,users[2],'cribbage');
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,ante_decision,is_bot)
  VALUES(a,g,users[1],1,100,'active',false,'ante_up',false),(b,g,users[2],2,100,'active',false,'ante_up',false);
  INSERT INTO public.rounds(id,game_id,round_number,hand_number,dealer_game_id,cards_dealt,pot,status)
  VALUES(r,g,1,1,dg,6,0,'betting');
  normal := private.cribbage_initial_state((SELECT x FROM public.games x WHERE id=g),ARRAY[a,b],b,private.cribbage_new_deck());
  -- Two pairs in the nondealer hand guarantee a winning count on the second pass.
  normal := jsonb_set(normal,'{cutCard}','{"rank":"K","suit":"diamonds","value":10}');
  normal := jsonb_set(normal,'{crib}','[{"rank":"4","suit":"hearts","value":4},{"rank":"6","suit":"clubs","value":6},{"rank":"8","suit":"clubs","value":8},{"rank":"5","suit":"clubs","value":5}]');
  normal := jsonb_set(normal,ARRAY['playerStates',a::text,'hand'],'[]');
  normal := jsonb_set(normal,ARRAY['playerStates',b::text,'hand'],'[]');
  normal := jsonb_set(normal,'{pegging,playedCards}',(SELECT jsonb_agg(jsonb_build_object('playerId',pid,'card',jsonb_build_object('rank',rank,'suit',suit,'value',rank::int)) ORDER BY ord)
    FROM (VALUES(1,a,'2','clubs'),(2,b,'4','clubs'),(3,a,'2','diamonds'),(4,b,'7','diamonds'),
      (5,a,'9','hearts'),(6,b,'3','hearts'),(7,a,'9','spades'),(8,b,'8','spades')) plays(ord,pid,rank,suit)));
  source_round := r;
  FOR i IN 1..2 LOOP
    s := private.cribbage_enter_counting(jsonb_set(normal,ARRAY['playerStates',a::text,'pegScore'],to_jsonb(CASE WHEN i=2 THEN 120 ELSE 0 END)));
    PERFORM private.cribbage_publish_state(r,s);
    s := public.cribbage_get_state(r);
    first_release := s#>>'{countingResolution,originalReleaseAt}';
    initial_start := s->>'countingStartedAt';
    IF first_release IS NULL OR first_release IS DISTINCT FROM s#>>'{countingResolution,presentationReleaseAt}'
       OR s ? 'pendingTerminal' THEN RAISE EXCEPTION 'missing or inconsistent counting clock'; END IF;
    IF public.cribbage_finalize_counting(r)->>'deduped' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'finalize replay'; END IF;
    IF i=1 THEN
      IF public.cribbage_complete_counting(r)->>'outcome' IS DISTINCT FROM 'presentation_pending' THEN RAISE EXCEPTION 'early release'; END IF;
      FOR v IN 0..1 LOOP
        pause_receipt := public.set_game_paused(g,true,dg,v*2);
        IF pause_receipt->>'outcome' IS DISTINCT FROM 'paused' THEN RAISE EXCEPTION 'pause failed %',pause_receipt; END IF;
        PERFORM pg_sleep(0.015);
        IF public.set_game_paused(g,false,dg,v*2+1)->>'outcome' IS DISTINCT FROM 'resumed' THEN RAISE EXCEPTION 'resume'; END IF;
      END LOOP;
      s := public.cribbage_get_state(r);
      IF s#>>'{countingResolution,originalReleaseAt}' IS DISTINCT FROM first_release OR s->>'countingStartedAt' IS DISTINCT FROM initial_start
         OR (s#>>'{countingResolution,presentationReleaseAt}')::timestamptz-first_release::timestamptz < interval '30 milliseconds' THEN RAISE EXCEPTION 'pause accumulation'; END IF;
      PERFORM set_config('app.cribbage_authoritative_write','on',true);
      UPDATE public.rounds SET presentation_fallback_at=clock_timestamp()-interval '1 second' WHERE id=r;
      result := public.cribbage_complete_counting(r);
      successor := (result->>'round_id')::uuid;
      IF result->>'outcome' IS DISTINCT FROM 'activated' OR successor IS NULL
        OR public.cribbage_complete_counting(r)->>'outcome' IS DISTINCT FROM 'already_active' THEN RAISE EXCEPTION 'successor replay'; END IF;
      r := successor;
    ELSE
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
      BEGIN
        PERFORM public.cribbage_complete_counting(r);
        RAISE EXCEPTION 'outsider allowed';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF; END;
      FOR v IN 1..2 LOOP
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[v],'role','authenticated')::text,true);
        result := public.cribbage_complete_counting(r);
        IF result->>'outcome' IS DISTINCT FROM 'terminal' OR result#>>'{state,winnerPlayerId}' IS DISTINCT FROM a::text THEN RAISE EXCEPTION 'terminal replay'; END IF;
        PERFORM public.cribbage_settle_game(g,r,dg,2);
      END LOOP;
    END IF;
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT count(*) FROM public.rounds WHERE predecessor_round_id=source_round)<>1
    OR (SELECT count(*) FROM public.game_results WHERE dealer_game_id=dg AND settlement_key='cribbage_terminal')<>1
    OR (SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=g)<>1
    OR (SELECT sum(chips) FROM public.players WHERE game_id=g)<>200
    OR (SELECT chips FROM public.players WHERE id=a)<=100 OR (SELECT chips FROM public.players WHERE id=b)>=100
    OR (SELECT count(*) FROM public.session_player_snapshots WHERE dealer_game_id=dg)<>2 THEN RAISE EXCEPTION 'financial or successor duplication'; END IF;
END $proof$;
ROLLBACK;
