-- Multiplayer opening orchestration only. Existing holes without openingCommits retain their contract.
CREATE OR REPLACE FUNCTION private.golf_open_commit(s jsonb, actor text, items integer[], at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(s->'players'); remaining integer; first_i integer:=((s->>'dealerIndex')::integer+1)%n; next_i integer; i integer; p jsonb; choices jsonb;
BEGIN
 PERFORM private.golf_integrity(s);
 IF s->>'phase'<>'opening' OR NOT s ? 'openingCommits' THEN RAISE EXCEPTION 'golf:phase';END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(s->'players') member WHERE member->>'id'=actor) THEN RAISE EXCEPTION 'golf:not_actor';END IF;
 IF cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL OR items[1] NOT BETWEEN 0 AND 5 OR items[2] NOT BETWEEN 0 AND 5 OR items[1]=items[2] THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
 choices:=to_jsonb(ARRAY(SELECT x FROM unnest(items)x ORDER BY x));
 IF s->'openingCommits' ? actor THEN
  IF s#>ARRAY['openingCommits',actor]<>choices THEN RAISE EXCEPTION 'golf:opening_committed';END IF;
  RETURN s;
 END IF;
 s:=jsonb_set(s,ARRAY['openingCommits',actor],choices);
 remaining:=n-(SELECT count(*) FROM jsonb_object_keys(s->'openingCommits'));
 next_i:=first_i;
 IF remaining=0 THEN
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   FOR i IN SELECT value::integer FROM jsonb_array_elements_text(s#>ARRAY['openingCommits',p->>'id']) LOOP
    s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed',i::text],'true');
   END LOOP;
  END LOOP;
 ELSE
  FOR i IN 0..n-1 LOOP
   next_i:=(first_i+i)%n;
   EXIT WHEN NOT s->'openingCommits' ? (s->'players'->next_i->>'id');
  END LOOP;
 END IF;
 RETURN s||jsonb_build_object('openingRemaining',remaining,'turnIndex',next_i,
  'phase',CASE WHEN remaining=0 THEN 'playing' ELSE 'opening' END,
  'deadline',CASE WHEN remaining=0 THEN to_jsonb(at_ms+30000) ELSE s->'deadline' END);
END $$;
REVOKE ALL ON FUNCTION private.golf_open_commit(jsonb,text,integer[],bigint) FROM PUBLIC,anon,authenticated,service_role;


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
 s:=s||jsonb_build_object('openingCommits','{}'::jsonb,'phase','opening','tableaus',boards,'pending',NULL,'discard',jsonb_build_array(deck->(6*n)),
  'stock',(SELECT jsonb_agg(value ORDER BY ordinal) FROM jsonb_array_elements(deck) WITH ORDINALITY c(value,ordinal) WHERE ordinal>6*n+1),
  'turnIndex',((s->>'dealerIndex')::integer+1)%n,'openingRemaining',n,'consecutiveNoRevealTurns',0,'finalQueue','[]'::jsonb,'finalReason',NULL,
  'deadline',at_ms+30000,'startedAt',at_ms);
 PERFORM private.golf_integrity(s);
 RETURN s;
END $function$;

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
 IF s->>'phase'='opening' AND s ? 'openingCommits' THEN
  IF action IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  RETURN private.golf_open_commit(s,actor,items,at_ms);
 END IF;
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
END $function$;

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
  'pending',CASE WHEN s ? 'openingCommits' OR s#>>'{pending,actor}'=viewer THEN s->'pending' ELSE 'null'::jsonb END,
  'hasPending',s->'pending'<>'null'::jsonb,'scores',s->'scores','holes',s->'holes',
  'consecutiveNoRevealTurns',s->'consecutiveNoRevealTurns','finalQueue',s->'finalQueue','finalReason',s->'finalReason',
  'deadline',s->'deadline','startedAt',s->'startedAt','terminal',s->'terminal','presentation',s->'presentation')||CASE WHEN s ? 'openingCommits' THEN jsonb_build_object('openingMode','simultaneous','openingCommitted',s->'openingCommits' ? viewer,'publicDraw',true) ELSE '{}'::jsonb END;
END $function$;

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
  'canAct',NOT coalesce(paused,false) AND NOT coalesce((m.player_controls#>>ARRAY[viewer::text,'autoPlay'])::boolean,false) AND m.state->>'phase' IN ('opening','playing') AND CASE WHEN m.state->>'phase'='opening' AND m.state ? 'openingCommits' THEN EXISTS(SELECT FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=viewer::text) AND NOT m.state->'openingCommits' ? viewer::text ELSE m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text END,
  'playerControls',m.player_controls,
  'stake',m.stake,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$;

CREATE OR REPLACE FUNCTION public.golf_action(p_dealer_game_id uuid,p_round_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.golf_matches; g public.games; player uuid; actor uuid:=auth.uid(); prior private.golf_requests;
 command jsonb:=jsonb_build_object('roundId',p_round_id,'revision',p_revision,'action',p_action,'items',p_items); at_ms bigint;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND NOT is_bot AND (status<>'left' OR m.settlement IS NOT NULL);
 IF player IS NULL OR NOT private.golf_actor_allowed(actor,m.game_id,m.dealer_game_id) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'golf:participant_required' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_round_id IS NULL OR p_action IS NULL OR p_action NOT IN ('open','draw','replace','discard','reject') THEN RAISE EXCEPTION 'golf:invalid_command';END IF;
 SELECT * INTO prior FROM private.golf_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'golf:replay_conflict';END IF;
  RETURN public.golf_snapshot(p_dealer_game_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'acceptedRevision',prior.accepted_revision));
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'six-card-golf' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'golf:inactive';END IF;
 IF m.round_id<>p_round_id OR p_revision<0 OR p_revision>m.revision OR (m.revision<>p_revision AND NOT (p_action='open' AND m.state ? 'openingCommits')) THEN RAISE EXCEPTION 'golf:stale_revision';END IF;
 IF NOT (p_action='open' AND m.state ? 'openingCommits') AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'golf:not_actor' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT FROM public.players WHERE id=player AND auto_fold) THEN RAISE EXCEPTION 'golf:autoplay_active';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF at_ms>=(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'golf:deadline';END IF;
 IF p_action='open' AND m.state ? 'openingCommits' THEN
  IF m.state->'openingCommits' ? player::text THEN
   IF cardinality(p_items) IS DISTINCT FROM 2 OR m.state#>ARRAY['openingCommits',player::text] IS DISTINCT FROM to_jsonb(ARRAY(SELECT x FROM unnest(p_items)x ORDER BY x)) THEN RAISE EXCEPTION 'golf:opening_committed';END IF;
   INSERT INTO private.golf_requests VALUES(m.dealer_game_id,p_request_id,actor,command,m.revision);
   RETURN public.golf_snapshot(m.dealer_game_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'acceptedRevision',m.revision));
  END IF;
  m.state:=private.golf_open_commit(m.state,player::text,p_items,at_ms);
 ELSE m.state:=private.golf_reduce(m.state,p_action,p_items,at_ms);END IF;
 INSERT INTO private.golf_requests VALUES(m.dealer_game_id,p_request_id,actor,command,m.revision+1);
 UPDATE private.golf_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.golf_settle(m.dealer_game_id);END IF;
 RETURN public.golf_snapshot(m.dealer_game_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'acceptedRevision',m.revision+1));
END $$;


CREATE OR REPLACE FUNCTION private.golf_schedule_bot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bot_index integer;
BEGIN
 IF NOT NEW.finished AND NEW.paused_at IS NULL AND NEW.state->>'phase'='opening' AND NEW.state ? 'openingCommits' THEN
  SELECT (x.ordinality-1)::integer INTO bot_index FROM jsonb_array_elements(NEW.state->'players') WITH ORDINALITY x(p,ordinality)
  JOIN public.players seat ON seat.id=(x.p->>'id')::uuid AND seat.game_id=NEW.game_id
  WHERE NOT NEW.state->'openingCommits' ? (x.p->>'id') AND (seat.is_bot OR seat.auto_fold) ORDER BY x.ordinality LIMIT 1;
  IF bot_index IS NOT NULL THEN NEW.state:=jsonb_set(NEW.state,'{turnIndex}',to_jsonb(bot_index));END IF;
 END IF;
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL OR NEW.state->>'phase' NOT IN ('opening','playing')
  OR NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id=(NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'id')::uuid AND (p.is_bot OR p.auto_fold) AND p.game_id=NEW.game_id) THEN NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' OR NEW.bot_due_at IS NULL THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;END IF;
 RETURN NEW;
END $$;
