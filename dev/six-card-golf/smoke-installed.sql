-- Captured deployed Golf definitions, 2026-10-24. Local reconstruction only; NOT a migration.
CREATE OR REPLACE FUNCTION private.golf_admission_rules()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE d public.game_defaults;BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='six-card-golf';
 RETURN private.golf_rules_v2()||jsonb_build_object('presentation',jsonb_build_object('version',1,'scoringDelayMs',d.golf_scoring_delay_ms,'resultsDurationMs',d.golf_results_duration_ms));
END $function$

;
CREATE OR REPLACE FUNCTION private.golf_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END $function$

;
CREATE OR REPLACE FUNCTION private.golf_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE work record; m private.golf_matches; g public.games; p public.players; at_ms bigint; count_i integer:=0; choice jsonb; prior jsonb; enabled boolean; policy text;
BEGIN
 prior:=private.capture_recovery_context();
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOR work IN SELECT x.dealer_game_id,x.game_id,x.round_id,x.revision FROM private.golf_matches x JOIN public.games live ON live.id=x.game_id
  WHERE NOT x.finished AND NOT live.is_paused AND x.paused_at IS NULL AND live.current_game_uuid=x.dealer_game_id
   AND live.game_type='six-card-golf' AND (x.settlement IS NOT NULL OR x.state->>'phase'='complete'
    OR least((x.state->>'deadline')::bigint,x.bot_due_at)<=floor(extract(epoch FROM clock_timestamp())*1000))
  ORDER BY x.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=work.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=work.game_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=work.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.round_id<>work.round_id OR m.revision<>work.revision OR g.is_paused OR m.paused_at IS NOT NULL
   OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'six-card-golf' THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  BEGIN
   PERFORM private.golf_integrity(m.state);
  EXCEPTION WHEN OTHERS THEN
   INSERT INTO private.golf_integrity_failures(dealer_game_id,revision,code) VALUES(m.dealer_game_id,m.revision,'card_partition')
    ON CONFLICT(dealer_game_id) DO NOTHING;
   PERFORM public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
   CONTINUE;
  END;
  IF m.settlement IS NOT NULL THEN PERFORM private.golf_finish_postgame(m.dealer_game_id);CONTINUE;END IF;
  IF g.status<>'in_progress' THEN CONTINUE;END IF;
  IF m.state->>'phase'='complete' THEN PERFORM private.golf_settle(m.dealer_game_id);
  ELSIF m.state->>'phase'='hole_complete' THEN PERFORM private.golf_next_hole(m.dealer_game_id,at_ms);
  ELSE
   SELECT * INTO STRICT p FROM public.players WHERE id=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid AND game_id=m.game_id FOR UPDATE;
   IF g.timeout_enforcement_enabled IS NOT NULL AND g.timeout_action IN ('none','auto_fold','auto_sit_out','auto_roll') THEN
    enabled:=g.timeout_enforcement_enabled;policy:=g.timeout_action;
   ELSE SELECT timeout_enforcement_enabled,timeout_action INTO enabled,policy FROM public.game_defaults WHERE game_type='six-card-golf';END IF;
   IF NOT p.is_bot AND (g.real_money OR NOT coalesce(enabled,false) OR policy IS DISTINCT FROM 'auto_fold') THEN
    IF (m.state->>'deadline')::bigint>at_ms THEN CONTINUE;END IF;
    UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(at_ms+30000)),revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
    PERFORM public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
   ELSE
    IF NOT p.is_bot AND NOT p.auto_fold THEN
     IF (m.state->>'deadline')::bigint>at_ms THEN CONTINUE;END IF;
     UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p.id;
    END IF;
    -- Renew the unresolved allowance before the all-human pause so explicit
    -- resume has a usable whole turn; no card/queue/counter changes occur.
    IF NOT p.is_bot AND (m.state->>'deadline')::bigint<=at_ms THEN
     m.state:=jsonb_set(m.state,'{deadline}',to_jsonb(at_ms+30000));
     UPDATE private.golf_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
    END IF;
    IF private.pause_all_humans_auto_fold(g.id) THEN CONTINUE;END IF;
    choice:=private.golf_bot_choice(private.golf_visible(m.state,p.id::text));
    m.state:=private.golf_reduce(m.state,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
    UPDATE private.golf_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
    IF m.state->>'phase'='complete' THEN PERFORM private.golf_settle(m.dealer_game_id);END IF;
   END IF;
  END IF;
  count_i:=count_i+1;
 END LOOP;
 PERFORM private.restore_recovery_context(prior);
 RETURN count_i;
EXCEPTION WHEN OTHERS THEN PERFORM private.restore_recovery_context(prior);RAISE;
END $function$

;
CREATE OR REPLACE FUNCTION private.golf_reduce(s jsonb, action text, items integer[], at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  -- Latch on the draw, while its card is pending. The current turn still finishes normally.
  IF s#>>'{rules,version}'='six-card-golf/2' AND NOT already_final
    AND jsonb_array_length(s->'stock')=(SELECT count(*) FROM jsonb_each(s->'tableaus') t
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.value->'exposed') e WHERE NOT e::boolean)) THEN
   s:=s||jsonb_build_object('stockFinalTrigger',actor);
  END IF;
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline.
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
 count_i:=CASE WHEN s#>>'{rules,version}'='six-card-golf/2' OR exposed_new THEN 0 ELSE (s->>'consecutiveNoRevealTurns')::integer+1 END;
 IF already_final THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'golf:integrity';END IF;
  queue:=queue-0;
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'exposed') e WHERE NOT e::boolean) THEN
  FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','six_exposed');
 ELSIF s#>>'{rules,version}'='six-card-golf/2' AND s->>'stockFinalTrigger'=actor THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','stock_threshold');
 ELSIF s#>>'{rules,version}'='six-card-golf/1' AND count_i>=5*n THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','prolonged_play');
 END IF;
 s:=(s-'stockFinalTrigger')||jsonb_build_object('consecutiveNoRevealTurns',count_i,'finalQueue',queue,'turnIndex',next_i,'deadline',at_ms+30000);
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
END $function$

;
CREATE OR REPLACE FUNCTION public.golf_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.golf_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
 IF viewer IS NULL OR NOT private.golf_actor_allowed(auth.uid(),m.game_id,m.dealer_game_id) THEN RAISE EXCEPTION 'golf:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='golf_terminal';
 RETURN private.golf_visible(m.state,viewer::text)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND NOT coalesce((m.player_controls#>>ARRAY[viewer::text,'autoPlay'])::boolean,false) AND m.state->>'phase' IN ('opening','playing') AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'playerControls',m.player_controls,
  'stake',m.stake,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$

;
CREATE OR REPLACE FUNCTION private.golf_visible(s jsonb, viewer text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
END $function$
;
