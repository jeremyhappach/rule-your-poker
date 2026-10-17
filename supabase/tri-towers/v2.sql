-- Mode-independent bonus eligibility shared by multiplayer and Solo Arcade.
CREATE OR REPLACE FUNCTION private.tri_towers_bonus_qualified_v2(score bigint,rules jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT score >= (rules->>'bonusThreshold')::bigint $$;
REVOKE ALL ON FUNCTION private.tri_towers_bonus_qualified_v2(bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Mode-independent board authority. No seats, sessions, settlement or mode defaults.
CREATE OR REPLACE FUNCTION private.tri_towers_board_deal_v2(b jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb:=private.tri_towers_shuffle();
BEGIN
 RETURN (b-'result')||jsonb_build_object('deck',deck,'removed','[]'::jsonb,'cursor',29,'waste',deck->28,'run',0,
  'scoreBefore',coalesce((b->>'score')::integer,0),'phase','ready','deadline',at_ms+(b#>>'{rules,readyMs}')::bigint,
  'event',jsonb_build_object('label','Play a card or draw to start','points',0));
END $$;

CREATE OR REPLACE FUNCTION private.tri_towers_board_finish_v2(b jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE time_i integer:=0; stock_i integer:=0; total_i integer; result jsonb;
BEGIN
 IF reason IN ('cleared','take_score') THEN time_i:=greatest(0,((b->>'deadline')::bigint-at_ms)/1000)*(b#>>'{rules,timePerSecond}')::integer;END IF;
 IF reason='cleared' THEN stock_i:=(52-(b->>'cursor')::integer)*(b#>>'{rules,stockPerCard}')::integer;END IF;
 total_i:=(b->>'score')::integer+time_i+stock_i;
 result:=jsonb_build_object('score',total_i,'scoreBefore',(b->>'scoreBefore')::integer,
  'stageScore',total_i-(b->>'scoreBefore')::integer,'timeBonus',time_i,'stockBonus',stock_i,'reason',reason,'completedAt',at_ms);
 RETURN b||jsonb_build_object('score',total_i,'result',result,'phase','stage_complete','deadline',at_ms+(b#>>'{rules,holdMs}')::bigint,
  'event',jsonb_build_object('label',CASE reason WHEN 'cleared' THEN 'All Three Towers Cleared!' WHEN 'take_score' THEN 'Score taken' WHEN 'ready_timeout' THEN 'Round not started' WHEN 'timeout' THEN 'Time expired' ELSE 'Round complete' END,'points',time_i+stock_i));
END $$;

CREATE OR REPLACE FUNCTION private.tri_towers_board_reduce_v2(b jsonb,action text,idx integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text:=b->>'phase'; run_i integer; points integer; before_i integer; cursor_i integer:=(b->>'cursor')::integer;
BEGIN
 IF phase NOT IN ('ready','playing') THEN RAISE EXCEPTION 'tri_towers:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.tri_towers_board_finish_v2(b,CASE WHEN phase='ready' THEN 'ready_timeout' ELSE 'timeout' END,at_ms);END IF;
 IF action='tick' THEN RETURN b;END IF;
 -- Validate BEFORE admitting the playing clock. Invalid actions cannot start it.
 IF action='remove' THEN
  IF private.tri_towers_legal(b,idx) IS DISTINCT FROM true THEN RAISE EXCEPTION 'tri_towers:illegal_move';END IF;
 ELSIF action='draw' THEN
  IF cursor_i>=52 THEN RAISE EXCEPTION 'tri_towers:stock_empty';END IF;
 ELSIF action<>'take_score' OR phase<>'playing' THEN RAISE EXCEPTION 'tri_towers:invalid_action';END IF;
 IF phase='ready' THEN b:=b||jsonb_build_object('phase','playing','deadline',at_ms+(b#>>'{rules,stageMs}')::bigint);END IF;
 IF action='take_score' THEN RETURN private.tri_towers_board_finish_v2(b,'take_score',at_ms);END IF;
 IF action='remove' THEN
  run_i:=(b->>'run')::integer+1;
  points:=(b->'rules'->'streakAwards'->>least(run_i-1,jsonb_array_length(b#>'{rules,streakAwards}')-1))::integer;
  b:=b||jsonb_build_object('removed',(b->'removed')||to_jsonb(idx),'waste',b->'deck'->idx);
  IF idx<3 THEN points:=points+(b->'rules'->'peakBonuses'->>((SELECT count(*) FROM jsonb_array_elements_text(b->'removed') r WHERE r::integer<3)-1)::integer)::integer;END IF;
  b:=b||jsonb_build_object('run',run_i,'score',(b->>'score')::integer+points,'event',jsonb_build_object('label',CASE WHEN idx<3 THEN 'Tower cleared' ELSE 'Streak '||run_i END,'points',points));
 ELSE
  before_i:=(b->>'score')::integer;points:=greatest(0,before_i-(b#>>'{rules,drawPenalty}')::integer)-before_i;
  b:=b||jsonb_build_object('cursor',cursor_i+1,'waste',b->'deck'->cursor_i,'run',0,'score',before_i+points,'event',jsonb_build_object('label','Stock drawn','points',points));
 END IF;
 IF jsonb_array_length(b->'removed')=28 THEN RETURN private.tri_towers_board_finish_v2(b,'cleared',at_ms);END IF;
 IF (b->>'cursor')::integer=52 AND NOT EXISTS(SELECT 1 FROM generate_series(0,27) i WHERE private.tri_towers_legal(b,i)) THEN
  RETURN private.tri_towers_board_finish_v2(b,'exhausted',at_ms);
 END IF;
 RETURN b;
END $$;

-- Multiplayer orchestration only: frozen clockwise seats, rounds, qualification.
CREATE OR REPLACE FUNCTION private.tri_towers_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE totals jsonb;
BEGIN
 IF s#>>'{rules,version}'<>'tri-towers/2' THEN RETURN private.tri_towers_deal_v1(s,at_ms);END IF;
 SELECT jsonb_object_agg(p->>'id',coalesce(s->'scores'->(p->>'id'),'0'::jsonb)) INTO totals FROM jsonb_array_elements(s->'players') p;
 RETURN private.tri_towers_board_deal_v2(s||jsonb_build_object('scores',totals,'score',coalesce(totals->(s->'players'->(s->>'turnIndex')::integer->>'id'),'0'::jsonb)),at_ms);
END $$;

CREATE OR REPLACE FUNCTION private.tri_towers_reduce(s jsonb,action text,idx integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE board jsonb; player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; next_i integer:=(s->>'turnIndex')::integer+1;
 round_i integer:=(s->>'stage')::integer; n integer:=jsonb_array_length(s->'players'); qualified jsonb; result jsonb;
BEGIN
 IF s#>>'{rules,version}'<>'tri-towers/2' THEN RETURN private.tri_towers_reduce_v1(s,action,idx,at_ms);END IF;
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'tri_towers:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action NOT IN ('tick','continue') THEN RAISE EXCEPTION 'tri_towers:phase';END IF;
  IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;
  IF next_i>=n AND round_i<2 THEN next_i:=0;round_i:=round_i+1;
  ELSIF next_i>=n AND round_i=2 THEN
   SELECT coalesce(jsonb_agg(p->>'id' ORDER BY ord),'[]'::jsonb) INTO qualified FROM jsonb_array_elements(s->'players') WITH ORDINALITY a(p,ord)
    WHERE private.tri_towers_bonus_qualified_v2((s->'scores'->>(p->>'id'))::bigint,s->'rules');
   s:=s||jsonb_build_object('qualified',qualified);round_i:=3;next_i:=0;
  END IF;
  IF round_i=3 THEN
   WHILE next_i<n AND NOT coalesce(s->'qualified','[]'::jsonb) ? (s->'players'->next_i->>'id') LOOP next_i:=next_i+1;END LOOP;
  END IF;
  IF next_i>=n THEN RETURN s||jsonb_build_object('phase','complete','deadline',0,'turnIndex',n,'event',jsonb_build_object('label','Competition complete','points',0));END IF;
  RETURN private.tri_towers_deal(s||jsonb_build_object('turnIndex',next_i,'stage',round_i),at_ms);
 END IF;
 -- Board operations do not own or inspect the multiplayer schedule.
 board:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
 board:=private.tri_towers_board_reduce_v2(board,action,idx,at_ms);
 s:=s||board;
 s:=jsonb_set(s,ARRAY['scores',player],s->'score');
 IF s->>'phase'='stage_complete' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=round_i) THEN RAISE EXCEPTION 'tri_towers:stage_already_final';END IF;
  result:=s->'result'||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,round_i),'playerId',player,'stage',round_i);
  s:=s||jsonb_build_object('stages',(s->'stages')||jsonb_build_array(result));
 END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.tri_towers_bot_choice(v jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i integer; best_i integer; value_i integer; best_value integer:=-1; next_points integer; peaks integer; r jsonb; uncovered integer;
BEGIN
 IF v ? 'deck' THEN RAISE EXCEPTION 'tri_towers:bot_private_input';END IF;
 IF v#>>'{rules,version}'<>'tri-towers/2' THEN RETURN private.tri_towers_bot_choice_v1(v,at_ms);END IF;
 IF v->>'phase' NOT IN ('ready','playing') THEN RETURN NULL;END IF;
 IF v->>'phase'='playing' AND (v->>'deadline')::bigint-at_ms<=2500 THEN RETURN jsonb_build_object('action','take_score');END IF;
 next_points:=(v->'rules'->'streakAwards'->>least((v->>'run')::integer,jsonb_array_length(v#>'{rules,streakAwards}')-1))::integer;
 FOR i IN 0..27 LOOP
  IF v->'cards'->i IS NULL OR v->'cards'->i='null'::jsonb OR v->'removed' @> to_jsonb(i) THEN CONTINUE;END IF;
  IF abs((v->'cards'->>i)::integer%13-(v->>'waste')::integer%13) NOT IN (1,12) THEN CONTINUE;END IF;
  r:=v||jsonb_build_object('removed',(v->'removed')||to_jsonb(i));
  SELECT count(*) INTO uncovered FROM generate_series(0,27) x WHERE private.tri_towers_exposed(r,x) AND NOT private.tri_towers_exposed(v,x);
  value_i:=next_points+uncovered*200;
  IF i<3 THEN SELECT count(*) INTO peaks FROM jsonb_array_elements_text(v->'removed') p WHERE p::integer<3;value_i:=value_i+(v->'rules'->'peakBonuses'->>peaks)::integer;END IF;
  IF value_i>best_value THEN best_value:=value_i;best_i:=i;END IF;
 END LOOP;
 IF best_i IS NOT NULL THEN RETURN jsonb_build_object('action','remove','index',best_i);END IF;
 RETURN jsonb_build_object('action',CASE WHEN (v->>'stockRemaining')::integer>0 THEN 'draw' ELSE 'take_score' END);
END $$;

-- Read-only canonical financial context; settlement remains entirely unchanged.
CREATE OR REPLACE FUNCTION public.tri_towers_snapshot(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 v:=public.tri_towers_snapshot_v1(p_dealer_game_id);
 IF v->'settlement'<>'null'::jsonb THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE
  SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=(v#>>'{identity,sessionId}')::uuid;
 END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='tri_towers_terminal';
 RETURN v||jsonb_build_object('financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,
  'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END));
END $$;
