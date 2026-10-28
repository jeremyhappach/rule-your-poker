-- Versioned presentation settings; base six-card-golf/1 gameplay stays unchanged.
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS golf_scoring_delay_ms integer NOT NULL DEFAULT 1200 CHECK (golf_scoring_delay_ms BETWEEN 200 AND 5000);
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS golf_results_duration_ms integer NOT NULL DEFAULT 5000 CHECK (golf_results_duration_ms BETWEEN 1000 AND 30000);
CREATE OR REPLACE FUNCTION private.golf_admission_rules() RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE d public.game_defaults;BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='six-card-golf';
 RETURN private.golf_rules()||jsonb_build_object('presentation',jsonb_build_object('version',1,'scoringDelayMs',d.golf_scoring_delay_ms,'resultsDurationMs',d.golf_results_duration_ms));
END $$;
CREATE OR REPLACE FUNCTION private.golf_supported_rules(r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb:=r->'presentation';BEGIN
 IF r=private.golf_rules() THEN RETURN true;END IF;
 RETURN coalesce(r-'presentation'=private.golf_rules() AND p=jsonb_build_object('version',1,'scoringDelayMs',(p->>'scoringDelayMs')::integer,'resultsDurationMs',(p->>'resultsDurationMs')::integer)
 AND (p->>'scoringDelayMs')::integer BETWEEN 200 AND 5000 AND (p->>'resultsDurationMs')::integer BETWEEN 1000 AND 30000,false);
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION private.golf_presentation(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb;b jsonb;hidden jsonb:='{}';indices jsonb;count_ms integer:=0;i integer;delay_ms integer:=(s#>>'{rules,presentation,scoringDelayMs}')::integer;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
  b:=s->'tableaus'->(p->>'id');indices:='[]';
  FOR i IN 0..5 LOOP IF NOT (b->'exposed'->>i)::boolean THEN indices:=indices||to_jsonb(i);END IF;END LOOP;
  hidden:=hidden||jsonb_build_object(p->>'id',indices);
  count_ms:=count_ms+700+2000+180+jsonb_array_length(indices)*delay_ms;
  FOR i IN 0..2 LOOP count_ms:=count_ms+delay_ms*CASE WHEN (b->'cards'->>i)::integer%13=(b->'cards'->>(i+3))::integer%13 THEN 1 ELSE 2 END;END LOOP;
 END LOOP;
 RETURN jsonb_build_object('version',1,'startedAt',at_ms,'resultsAt',at_ms+count_ms,'endsAt',at_ms+count_ms+(s#>>'{rules,presentation,resultsDurationMs}')::integer,'hidden',hidden);
END $$;
CREATE OR REPLACE FUNCTION private.golf_shift_presentation(s jsonb,delta bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;BEGIN
 IF s ? 'presentation' THEN FOREACH k IN ARRAY ARRAY['startedAt','resultsAt','endsAt'] LOOP s:=jsonb_set(s,ARRAY['presentation',k],to_jsonb((s#>>ARRAY['presentation',k])::bigint+delta));END LOOP;END IF;
 IF s ? 'terminal' THEN FOREACH k IN ARRAY ARRAY['startedAt','deadline'] LOOP s:=jsonb_set(s,ARRAY['terminal',k],to_jsonb((s#>>ARRAY['terminal',k])::bigint+delta));END LOOP;END IF;
 RETURN s||jsonb_build_object('deadline',(s->>'deadline')::bigint+delta)||CASE WHEN s ? 'startedAt' THEN jsonb_build_object('startedAt',(s->>'startedAt')::bigint+delta) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION private.golf_admission_rules(),private.golf_supported_rules(jsonb),private.golf_presentation(jsonb,bigint),private.golf_shift_presentation(jsonb,bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.golf_deal(s jsonb, at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb; n integer:=jsonb_array_length(s->'players'); i integer; j integer; boards jsonb:='{}'; hand jsonb; id text;
BEGIN
 s:=s-'presentation';
 SELECT private.golf_shuffle(jsonb_agg(c ORDER BY c)) INTO deck FROM generate_series(0,51) c;
 FOR i IN 0..n-1 LOOP
  id:=s->'players'->i->>'id';hand:='[]';
  FOR j IN 0..5 LOOP hand:=hand||jsonb_build_array(deck->(i*6+j));END LOOP;
  boards:=boards||jsonb_build_object(id,jsonb_build_object('cards',hand,'exposed','[false,false,false,false,false,false]'::jsonb));
 END LOOP;
 s:=s||jsonb_build_object('phase','opening','tableaus',boards,'pending',NULL,'discard',jsonb_build_array(deck->(6*n)),
  'stock',(SELECT jsonb_agg(value ORDER BY ordinal) FROM jsonb_array_elements(deck) WITH ORDINALITY c(value,ordinal) WHERE ordinal>6*n+1),
  'turnIndex',((s->>'dealerIndex')::integer+1)%n,'openingRemaining',n,'consecutiveNoRevealTurns',0,'finalQueue','[]'::jsonb,'finalReason',NULL,
  'deadline',at_ms+30000,'startedAt',at_ms);
 PERFORM private.golf_integrity(s);
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.golf_visible(s jsonb, viewer text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE boards jsonb:='{}'; p jsonb; b jsonb; cards jsonb; i integer;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
  b:=s->'tableaus'->(p->>'id');cards:='[]';
  FOR i IN 0..5 LOOP cards:=cards||jsonb_build_array(CASE WHEN (b->'exposed'->>i)::boolean THEN b->'cards'->i ELSE 'null'::jsonb END);END LOOP;
  boards:=boards||jsonb_build_object(p->>'id',jsonb_build_object('cards',cards,'exposed',b->'exposed'));
 END LOOP;
 RETURN jsonb_build_object('identity',s->'identity','rules',s->'rules','players',s->'players','phase',s->'phase',
  'hole',s->'hole','dealerIndex',s->'dealerIndex','turnIndex',s->'turnIndex','openingRemaining',s->'openingRemaining',
  'tableaus',boards,'stockCount',jsonb_array_length(s->'stock'),'discardTop',CASE WHEN s->>'phase'='opening' THEN 'null'::jsonb ELSE s->'discard'->-1 END,
  'pending',CASE WHEN s#>>'{pending,actor}'=viewer THEN s->'pending' ELSE 'null'::jsonb END,
  'hasPending',s->'pending'<>'null'::jsonb,'scores',s->'scores','holes',s->'holes',
  'consecutiveNoRevealTurns',s->'consecutiveNoRevealTurns','finalQueue',s->'finalQueue','finalReason',s->'finalReason',
  'deadline',s->'deadline','startedAt',s->'startedAt','terminal',s->'terminal','presentation',s->'presentation');
END $$;

CREATE OR REPLACE FUNCTION private.golf_reduce(s jsonb, action text, items integer[], at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(s->'players'); actor_i integer:=(s->>'turnIndex')::integer;
 actor text:=s->'players'->actor_i->>'id'; b jsonb; card jsonb; old_card jsonb; pos integer; exposed_new boolean:=false;
 queue jsonb:=s->'finalQueue'; already_final boolean:=s->>'finalReason' IS NOT NULL;
 next_i integer:=(actor_i+1)%n; count_i integer; i integer; totals jsonb:=s->'scores'; results jsonb:='{}'; p jsonb; score_i integer; remaining integer;
BEGIN
 PERFORM private.golf_integrity(s);
 IF s->>'phase' NOT IN ('opening','playing') THEN RAISE EXCEPTION 'golf:phase';END IF;
 b:=s->'tableaus'->actor;
 IF s->>'phase'='opening' THEN
  IF action IS DISTINCT FROM 'open' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL
    OR items[1] NOT BETWEEN 0 AND 5 OR items[2] NOT BETWEEN 0 AND 5 OR items[1]=items[2] THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['exposed',items[1]::text],'true'),ARRAY['exposed',items[2]::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);remaining:=(s->>'openingRemaining')::integer-1;
  RETURN s||jsonb_build_object('openingRemaining',remaining,'phase',CASE WHEN remaining=0 THEN 'playing' ELSE 'opening' END,
    'turnIndex',next_i,'deadline',at_ms+30000);
 END IF;
 IF action='draw' THEN
  IF s->'pending'<>'null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_draw';END IF;
  IF jsonb_array_length(s->'stock')=0 THEN
   IF jsonb_array_length(s->'discard')<=1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
   s:=s||jsonb_build_object('stock',private.golf_shuffle((s->'discard')-(jsonb_array_length(s->'discard')-1)),'discard',jsonb_build_array(s->'discard'->-1));
  END IF;
  s:=s||jsonb_build_object('pending',jsonb_build_object('actor',actor,'card',s->'stock'->0),'stock',(s->'stock')-0);
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline and progress counter.
 ELSIF action='reject' THEN
  IF s->'pending'='null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_reject';END IF;
  s:=s||jsonb_build_object('discard',(s->'discard')||jsonb_build_array(s#>'{pending,card}'),'pending',NULL);
 ELSIF action IN ('replace','discard') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'golf:illegal_position';END IF;
  pos:=items[1];old_card:=b->'cards'->pos;exposed_new:=NOT (b->'exposed'->>pos)::boolean;
  IF action='replace' THEN
   IF s->'pending'='null'::jsonb THEN RAISE EXCEPTION 'golf:pending_required';END IF;
   card:=s#>'{pending,card}';s:=s||jsonb_build_object('pending',NULL);
  ELSE
   IF s->'pending'<>'null'::jsonb OR jsonb_array_length(s->'discard')=0 THEN RAISE EXCEPTION 'golf:illegal_discard';END IF;
   card:=s->'discard'->-1;s:=jsonb_set(s,'{discard}',(s->'discard')-(jsonb_array_length(s->'discard')-1));
  END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['cards',pos::text],card),ARRAY['exposed',pos::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);
  s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(old_card));
 ELSE RAISE EXCEPTION 'golf:invalid_action';
 END IF;
 count_i:=CASE WHEN exposed_new THEN 0 ELSE (s->>'consecutiveNoRevealTurns')::integer+1 END;
 IF already_final THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'golf:integrity';END IF;
  queue:=queue-0;
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'exposed') e WHERE NOT e::boolean) THEN
  FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','six_exposed');
 ELSIF count_i>=5*n THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','prolonged_play');
 END IF;
 s:=s||jsonb_build_object('consecutiveNoRevealTurns',count_i,'finalQueue',queue,'turnIndex',next_i,'deadline',at_ms+30000);
 IF already_final AND jsonb_array_length(queue)=0 THEN
  IF s#>'{rules,presentation}' IS NOT NULL THEN s:=s||jsonb_build_object('presentation',private.golf_presentation(s,at_ms));END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   score_i:=private.golf_score(s->'tableaus'->(p->>'id')->'cards');
   results:=results||jsonb_build_object(p->>'id',score_i);
   totals:=totals||jsonb_build_object(p->>'id',(totals->>(p->>'id'))::integer+score_i);
   s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed'],'[true,true,true,true,true,true]');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'holes') h WHERE h->>'hole'=s->>'hole') THEN RAISE EXCEPTION 'golf:integrity';END IF;
  s:=s||jsonb_build_object('scores',totals,'holes',(s->'holes')||jsonb_build_array(jsonb_build_object('hole',s->'hole','roundId',s#>'{identity,roundId}','scores',results,'tableaus',s->'tableaus')),
    'phase',CASE WHEN (s->>'hole')::integer=9 THEN 'complete' ELSE 'hole_complete' END,'deadline',coalesce((s#>>'{presentation,endsAt}')::bigint,at_ms+6000));
 END IF;
 PERFORM private.golf_integrity(s);RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.golf_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.golf_actor_allowed(actor,p_game_id) OR p_game_type IS DISTINCT FROM 'six-card-golf' THEN RAISE EXCEPTION 'golf:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'golf:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'golf:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'golf:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'golf:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT private.golf_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'golf:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'golf:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.golf_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'golf:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'golf:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'golf:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'golf:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'six-card-golf',jsonb_build_object('ante_amount',stake_i,'rules',private.golf_admission_rules())) RETURNING * INTO dg;
 -- Freeze already-authorized access for this match. Expiry/revocation prevents
 -- new matches, but cannot strand accepted liabilities or an unresolved offer.
 INSERT INTO private.golf_qualified_matches(dealer_game_id,game_id,user_id)
 SELECT dg.id,g.id,(p->>'userId')::uuid FROM jsonb_array_elements(people) p
 WHERE NOT (p->>'isBot')::boolean;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='six-card-golf',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION private.golf_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.golf_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'six-card-golf' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR jsonb_array_length(m.state->'holes')<>9 OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'golf:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT min(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'golf:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'golf_terminal','six-card-golf',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Six-Card Golf: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.golf_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT min(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0))+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Six-Card Golf complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$;

CREATE OR REPLACE FUNCTION private.golf_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'six-card-golf' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.golf_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished AND (settlement IS NULL OR state ? 'presentation');
 ELSE UPDATE private.golf_matches SET state=private.golf_shift_presentation(state,at_ms-paused_at),paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND NOT finished AND (settlement IS NULL OR state ? 'presentation');END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.golf_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.golf_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'golf:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished OR g.is_paused OR m.paused_at IS NOT NULL THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'six-card-golf' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'golf:close_identity';END IF;
 IF g.status<>'session_ended' THEN
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false WHERE game_id=m.game_id;
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL)<2 THEN
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT array_agg(position ORDER BY position DESC) INTO positions FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL AND NOT is_bot;
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='golf_terminal';
    SELECT position INTO next_seat FROM public.players WHERE id=winner AND game_id=m.game_id AND NOT is_bot AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
    IF next_seat IS NULL THEN IF cardinality(positions)=1 THEN next_seat:=positions[1];ELSE target:='dealer_selection';END IF;END IF;
   END IF;
   IF target IS NULL THEN
    IF next_seat IS NULL THEN SELECT max(p) INTO next_seat FROM unnest(positions) p WHERE p<g.dealer_position;next_seat:=coalesce(next_seat,positions[1]);END IF;
    target:=CASE WHEN next_seat IS NULL THEN 'dealer_selection' ELSE 'game_selection' END;
   END IF;
  END IF;
  UPDATE public.games SET status=target,game_type=CASE WHEN target='session_ended' THEN game_type END,
   current_game_uuid=NULL,config_complete=false,current_round=NULL,total_hands=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
   last_round_result=NULL,awaiting_next_round=false,next_round_number=NULL,game_over_at=NULL,pot=0,
   ante_decision_deadline=NULL,buck_position=NULL,is_first_hand=false,dealer_selection_state=NULL,
   dealer_position=coalesce(next_seat,dealer_position),config_deadline=CASE WHEN target='game_selection' THEN clock_timestamp()+make_interval(secs=>greatest(1,game_setup_timer_seconds)) END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=m.game_id;
 END IF;
 UPDATE private.golf_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$;

CREATE OR REPLACE FUNCTION private.golf_begin(p_game uuid, p_dealer uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; dg public.dealer_games; people jsonb; s jsonb; r uuid:=gen_random_uuid(); n integer; stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type IS DISTINCT FROM 'six-card-golf' OR g.is_paused THEN RAISE EXCEPTION 'golf:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i OR NOT private.golf_supported_rules(dg.config->'rules') THEN RAISE EXCEPTION 'golf:configuration_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'golf:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'chips',p.chips)
  ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id)
 INTO people FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 n:=jsonb_array_length(people);
 IF n NOT BETWEEN 2 AND 4 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'golf:accepted_player_count';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean AND NOT private.golf_actor_allowed((p->>'userId')::uuid,g.id,dg.id)) THEN RAISE EXCEPTION 'golf:tester_required' USING ERRCODE='42501';END IF;
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
 VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'rules',dg.config->'rules',
  'players',people,'hole',1,'dealerIndex',n-1,'scores',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(people) p),'holes','[]'::jsonb);
 s:=private.golf_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO private.golf_matches(dealer_game_id,game_id,round_id,state,stake,player_controls)
 VALUES(p_dealer,p_game,r,s,stake_i,(SELECT jsonb_object_agg(p.id::text,jsonb_build_object('autoPlay',p.auto_fold,'sitOutNextHand',p.sit_out_next_hand,'intentVersion',p.intent_version)) FROM public.players p WHERE p.game_id=p_game AND p.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(people) x)));
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $$;

CREATE OR REPLACE FUNCTION private.golf_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.game_id<>OLD.game_id OR NEW.dealer_game_id<>OLD.dealer_game_id OR NEW.stake<>OLD.stake
  OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players' OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules'
  OR (OLD.settlement IS NOT NULL AND (NEW.settlement IS DISTINCT FROM OLD.settlement OR (NEW.state IS DISTINCT FROM OLD.state AND NOT coalesce((OLD.state ? 'presentation' AND OLD.paused_at IS NOT NULL AND NEW.paused_at IS NULL AND (NEW.state->>'deadline')::bigint>=(OLD.state->>'deadline')::bigint AND NEW.state=private.golf_shift_presentation(OLD.state,(NEW.state->>'deadline')::bigint-(OLD.state->>'deadline')::bigint)),false))))) THEN RAISE EXCEPTION 'golf:immutable_match';END IF;
 IF TG_OP='INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN PERFORM private.golf_integrity(NEW.state);END IF;
 RETURN NEW;
END $$;
