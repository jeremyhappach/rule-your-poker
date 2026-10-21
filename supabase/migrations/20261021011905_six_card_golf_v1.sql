DO $requirements$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') OR to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN RAISE EXCEPTION 'golf:pg_cron_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN RAISE EXCEPTION 'golf:realtime_publication_required';END IF;
 IF current_setting('wal_level')<>'logical' THEN RAISE EXCEPTION 'golf:logical_replication_required';END IF;
END $requirements$;
DO $guard$ DECLARE f record;BEGIN FOR f IN SELECT * FROM (VALUES ('private.megatouch_begin(uuid,uuid)','26754906038b83e7ca739196957376d0'),('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)','7b6ca8feaa35c1fcce8b00491783e9d4'),('private.megatouch_frozen_stake()','66207ae4a79447ec634f8b3afaff9512'),('public.settle_gameplay_chip_transfers(uuid,jsonb,text)','86c0feb55524f14ab9f58a06cdee2ef6'),('public.submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)','c633a318c7f2605104c92e03d3b3b09a'),('public.set_game_paused(uuid,boolean,uuid,bigint)','1fa2220c33734d1cf14c11f3eaef432b'),('private.split_whole_chips_clockwise(uuid,uuid[],integer,integer)','b6eb18407c38efdc17d6b181820cfa9a'),('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)','a69f39fefb234c3b01114c8049fdbbb6')) expected(signature,hash) LOOP
 IF md5(pg_get_functiondef(to_regprocedure(f.signature))) IS DISTINCT FROM f.hash AND md5(replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13)||chr(10),chr(10))) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'golf:shared_authority_changed:%',f.signature;END IF;END LOOP;END $guard$;
-- six-card-golf/1: private, versioned rule authority. Cards are integers 0..51.
-- Rank = card % 13 + 1; suit = card / 13. Never project concealed integers.
CREATE OR REPLACE FUNCTION private.golf_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"six-card-golf/1","holes":9,"turnSeconds":30,"openingCards":2,"warningCircuits":4,"finalCircuits":5,"holeResultSeconds":6}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.golf_shuffle(cards jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE a integer[]; i integer; j integer; t integer; bytes bytea; sample bigint; ceiling_i bigint;
BEGIN
 SELECT array_agg(value::integer ORDER BY ordinal) INTO a
 FROM jsonb_array_elements_text(cards) WITH ORDINALITY AS c(value,ordinal);
 FOR i IN REVERSE coalesce(cardinality(a),0)..2 LOOP
  ceiling_i:=4294967296-(4294967296%i);
  LOOP
   bytes:=extensions.gen_random_bytes(4);
   sample:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)*256+get_byte(bytes,3);
   EXIT WHEN sample<ceiling_i;
  END LOOP;
  j:=(sample%i)::integer+1;t:=a[i];a[i]:=a[j];a[j]:=t;
 END LOOP;
 RETURN coalesce(to_jsonb(a),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION private.golf_points(card integer) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT CASE card%13+1 WHEN 1 THEN 1 WHEN 2 THEN -2 WHEN 11 THEN 10 WHEN 12 THEN 10 WHEN 13 THEN 0 ELSE card%13+1 END
$$;
CREATE OR REPLACE FUNCTION private.golf_score(cards jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE answer integer:=0; i integer; a integer; b integer;
BEGIN
 IF jsonb_array_length(cards)<>6 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 FOR i IN 0..2 LOOP
  a:=(cards->>i)::integer;b:=(cards->>(i+3))::integer;
  IF a%13<>b%13 THEN answer:=answer+private.golf_points(a)+private.golf_points(b);END IF;
 END LOOP;
 RETURN answer;
END $$;

CREATE OR REPLACE FUNCTION private.golf_integrity(s jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(s->'players'); cards jsonb; pending_i integer; count_i integer; distinct_i integer; low_i integer; high_i integer;
BEGIN
 IF n NOT BETWEEN 2 AND 4 OR s#>>'{rules,version}' IS DISTINCT FROM 'six-card-golf/1'
  OR (SELECT count(*) FROM jsonb_object_keys(s->'tableaus'))<>n THEN RAISE EXCEPTION 'golf:integrity';END IF;
 pending_i:=CASE WHEN s->'pending'='null'::jsonb THEN 0 ELSE 1 END;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'players') p
  WHERE jsonb_array_length(s->'tableaus'->(p->>'id')->'cards') IS DISTINCT FROM 6
   OR jsonb_array_length(s->'tableaus'->(p->>'id')->'exposed') IS DISTINCT FROM 6)
  OR 6*n+jsonb_array_length(s->'stock')+jsonb_array_length(s->'discard')+pending_i<>52
  OR (pending_i=1 AND s#>>'{pending,actor}' IS DISTINCT FROM s->'players'->(s->>'turnIndex')::integer->>'id')
 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 SELECT coalesce(jsonb_agg(c),'[]'::jsonb) INTO cards FROM jsonb_each(s->'tableaus') t CROSS JOIN LATERAL jsonb_array_elements(t.value->'cards') c;
 cards:=cards||(s->'stock')||(s->'discard')||CASE WHEN pending_i=1 THEN jsonb_build_array(s#>'{pending,card}') ELSE '[]'::jsonb END;
 SELECT count(*),count(DISTINCT value::integer),min(value::integer),max(value::integer) INTO count_i,distinct_i,low_i,high_i FROM jsonb_array_elements_text(cards);
 IF count_i<>52 OR distinct_i<>52 OR low_i<>0 OR high_i<>51 THEN RAISE EXCEPTION 'golf:integrity';END IF;
END $$;

CREATE OR REPLACE FUNCTION private.golf_deal(s jsonb, at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb; n integer:=jsonb_array_length(s->'players'); i integer; j integer; boards jsonb:='{}'; hand jsonb; id text;
BEGIN
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

-- Whitelist projection: no raw stock, concealed card, hidden score, or private RNG.
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
  'tableaus',boards,'stockCount',jsonb_array_length(s->'stock'),'discardTop',s->'discard'->-1,
  'pending',CASE WHEN s#>>'{pending,actor}'=viewer THEN s->'pending' ELSE 'null'::jsonb END,
  'hasPending',s->'pending'<>'null'::jsonb,'scores',s->'scores','holes',s->'holes',
  'consecutiveNoRevealTurns',s->'consecutiveNoRevealTurns','finalQueue',s->'finalQueue','finalReason',s->'finalReason',
  'deadline',s->'deadline','startedAt',s->'startedAt','terminal',s->'terminal');
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
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   score_i:=private.golf_score(s->'tableaus'->(p->>'id')->'cards');
   results:=results||jsonb_build_object(p->>'id',score_i);
   totals:=totals||jsonb_build_object(p->>'id',(totals->>(p->>'id'))::integer+score_i);
   s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed'],'[true,true,true,true,true,true]');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'holes') h WHERE h->>'hole'=s->>'hole') THEN RAISE EXCEPTION 'golf:integrity';END IF;
  s:=s||jsonb_build_object('scores',totals,'holes',(s->'holes')||jsonb_build_array(jsonb_build_object('hole',s->'hole','roundId',s#>'{identity,roundId}','scores',results,'tableaus',s->'tableaus')),
    'phase',CASE WHEN (s->>'hole')::integer=9 THEN 'complete' ELSE 'hole_complete' END,'deadline',at_ms+6000);
 END IF;
 PERFORM private.golf_integrity(s);RETURN s;
END $$;

-- Functions are private even before the adapter's final privilege pass.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'golf_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;

-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.golf_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, admission_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.golf_release DEFAULT VALUES;
ALTER TABLE private.golf_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.golf_release FROM PUBLIC,anon,authenticated,service_role;

-- Empty by default. Only a privileged, separately approved grant can admit an
-- existing account into an exact existing qualification session before expiry.
CREATE TABLE private.golf_qualification (
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(game_id,user_id), CHECK(expires_at>created_at)
);
CREATE TABLE private.golf_qualified_matches (
 dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 PRIMARY KEY(dealer_game_id,user_id)
);
ALTER TABLE private.golf_qualification ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.golf_qualified_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.golf_qualification,private.golf_qualified_matches FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.golf_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint, bot_due_at bigint,
 player_controls jsonb NOT NULL DEFAULT '{}',

 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX golf_matches_session ON private.golf_matches(game_id);
CREATE INDEX golf_matches_pending ON private.golf_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE TABLE private.golf_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.golf_matches(dealer_game_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL, accepted_revision bigint NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.golf_history (
 dealer_game_id uuid NOT NULL REFERENCES private.golf_matches(dealer_game_id) ON DELETE CASCADE,
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.golf_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.golf_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.golf_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.golf_matches,private.golf_requests,private.golf_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.golf_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.golf_matches(dealer_game_id) ON DELETE CASCADE,
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.golf_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golf_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.golf_revisions TO authenticated;
CREATE POLICY golf_member_read ON public.golf_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=golf_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

CREATE OR REPLACE FUNCTION private.golf_actor_allowed(actor uuid, session_id uuid DEFAULT NULL, match_id uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND (EXISTS(SELECT 1 FROM private.golf_release WHERE singleton AND enabled)
   OR EXISTS(SELECT 1 FROM private.golf_qualification q WHERE q.game_id=session_id AND q.user_id=actor AND q.expires_at>clock_timestamp())
   OR EXISTS(SELECT 1 FROM private.golf_qualified_matches q WHERE q.game_id=session_id AND q.user_id=actor AND (match_id IS NULL OR q.dealer_game_id=match_id)))
$function$
;
CREATE OR REPLACE FUNCTION private.golf_admission_allowed(actor uuid, session_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT actor IS NOT NULL AND EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active)
 AND (EXISTS(SELECT FROM private.golf_release WHERE singleton AND enabled AND admission_enabled)
 OR EXISTS(SELECT FROM private.golf_qualification WHERE game_id=session_id AND user_id=actor AND expires_at>clock_timestamp()))
$$;
CREATE OR REPLACE FUNCTION public.golf_revision_allowed(p_game_id uuid,p_dealer_game_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.golf_actor_allowed(auth.uid(),p_game_id,p_dealer_game_id)
 AND EXISTS(SELECT FROM private.golf_matches WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id)
 AND EXISTS(SELECT FROM public.players WHERE game_id=p_game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot)
$$;
ALTER POLICY golf_member_read ON public.golf_revisions USING(public.golf_revision_allowed(game_id,dealer_game_id));
CREATE OR REPLACE FUNCTION public.golf_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.golf_admission_allowed(actor,p_session_id);
BEGIN
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.golf_admission_allowed(user_id,p_session_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',false);
END $function$
;
CREATE OR REPLACE FUNCTION private.golf_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.golf_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.golf_history VALUES(NEW.dealer_game_id,NEW.revision,private.golf_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
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
CREATE OR REPLACE FUNCTION public.golf_history(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.golf_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.golf_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $function$
;
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
 UPDATE private.golf_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT min(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Six-Card Golf complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
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
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'six-card-golf',jsonb_build_object('ante_amount',stake_i,'rules',private.golf_rules())) RETURNING * INTO dg;
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
END $function$
;
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
 IF m.finished THEN RETURN;END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.golf_close(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE session uuid; BEGIN SELECT game_id INTO STRICT session FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id;
IF NOT private.golf_actor_allowed(auth.uid(),session,p_dealer_game_id) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=session AND user_id=auth.uid() AND status<>'left' AND NOT is_bot) THEN RAISE EXCEPTION 'golf:close_denied' USING ERRCODE='42501';END IF;
PERFORM private.golf_finish_postgame(p_dealer_game_id);END $function$
;
CREATE OR REPLACE FUNCTION private.golf_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'six-card-golf' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.golf_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE UPDATE private.golf_matches SET state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)||CASE WHEN state ? 'startedAt' THEN jsonb_build_object('startedAt',(state->>'startedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL;END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION private.golf_begin(p_game uuid, p_dealer uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; dg public.dealer_games; people jsonb; s jsonb; r uuid:=gen_random_uuid(); n integer; stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type IS DISTINCT FROM 'six-card-golf' OR g.is_paused THEN RAISE EXCEPTION 'golf:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i OR dg.config->'rules' IS DISTINCT FROM private.golf_rules() THEN RAISE EXCEPTION 'golf:configuration_changed';END IF;
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

-- Caller holds round -> game -> match. One predecessor can create one successor.
CREATE OR REPLACE FUNCTION private.golf_next_hole(p_dealer uuid, at_ms bigint) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.golf_matches; g public.games; r uuid:=gen_random_uuid(); hole_i integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_dealer
  OR m.state->>'phase'<>'hole_complete' OR (m.state->>'deadline')::bigint>at_ms THEN RETURN;END IF;
 hole_i:=(m.state->>'hole')::integer+1;
 IF hole_i NOT BETWEEN 2 AND 9 OR jsonb_array_length(m.state->'holes')<>hole_i-1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,predecessor_round_id,cards_dealt,status,pot)
 VALUES(r,m.game_id,p_dealer,1,hole_i,m.round_id,0,'betting',0);
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 m.state:=jsonb_set(m.state,'{identity,roundId}',to_jsonb(r));
 m.state:=private.golf_deal(m.state||jsonb_build_object('hole',hole_i,'dealerIndex',((m.state->>'dealerIndex')::integer+1)%jsonb_array_length(m.state->'players')),at_ms);
 UPDATE private.golf_matches SET round_id=r,state=m.state,revision=revision+1 WHERE dealer_game_id=p_dealer;
 UPDATE public.games SET current_round=hole_i WHERE id=m.game_id;
END $$;

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
 IF m.round_id<>p_round_id OR m.revision<>p_revision THEN RAISE EXCEPTION 'golf:stale_revision';END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'golf:not_actor' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT FROM public.players WHERE id=player AND auto_fold) THEN RAISE EXCEPTION 'golf:autoplay_active';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF at_ms>=(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'golf:deadline';END IF;
 m.state:=private.golf_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.golf_requests VALUES(m.dealer_game_id,p_request_id,actor,command,m.revision+1);
 UPDATE private.golf_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.golf_settle(m.dealer_game_id);END IF;
 RETURN public.golf_snapshot(m.dealer_game_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'acceptedRevision',m.revision+1));
END $$;

-- Match identity, admitted configuration and liabilities cannot be rewritten.
CREATE OR REPLACE FUNCTION private.golf_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.game_id<>OLD.game_id OR NEW.dealer_game_id<>OLD.dealer_game_id OR NEW.stake<>OLD.stake
  OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players' OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules'
  OR (OLD.settlement IS NOT NULL AND (NEW.settlement IS DISTINCT FROM OLD.settlement OR NEW.state IS DISTINCT FROM OLD.state))) THEN RAISE EXCEPTION 'golf:immutable_match';END IF;
 IF TG_OP='INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN PERFORM private.golf_integrity(NEW.state);END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER golf_guard BEFORE INSERT OR UPDATE ON private.golf_matches FOR EACH ROW EXECUTE FUNCTION private.golf_guard();

CREATE OR REPLACE FUNCTION private.golf_roster_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.golf_matches;
BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM private.golf_matches WHERE game_id=NEW.game_id AND settlement IS NULL AND NOT finished) THEN NEW.waiting:=true;END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO m FROM private.golf_matches WHERE game_id=OLD.game_id AND settlement IS NULL AND NOT finished
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(state->'players') p WHERE p->>'id'=OLD.id::text);
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'golf:match_liability_committed';END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.is_bot IS DISTINCT FROM OLD.is_bot THEN RAISE EXCEPTION 'golf:participant_identity_frozen';END IF;
 IF NEW.position IS DISTINCT FROM OLD.position OR NEW.status IN ('left','observer') THEN
  NEW.position:=OLD.position;NEW.status:=OLD.status;NEW.stand_up_next_hand:=true;
 END IF;
 IF NEW.sitting_out AND NOT OLD.sitting_out THEN NEW.sitting_out:=OLD.sitting_out;NEW.sit_out_next_hand:=true;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER golf_committed_roster BEFORE INSERT OR UPDATE OR DELETE ON public.players FOR EACH ROW EXECUTE FUNCTION private.golf_roster_guard();

-- Observation-only policy: this function receives the exact actor projection.
-- No table reads, deck queries or concealed-card access. Stable tie ordering.
CREATE OR REPLACE FUNCTION private.golf_bot_choice(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE actor text:=v->'players'->(v->>'turnIndex')::integer->>'id'; cards jsonb; card integer; i integer; peer integer;
 before_i numeric; after_i numeric; gain numeric; best numeric:=-10000; best_i integer:=0;
 unknown_mean numeric:=71.0/13; urgency numeric:=0; next_cards jsonb; assistance numeric:=0; candidate_action text;
BEGIN
 IF v->>'phase'='opening' THEN RETURN '{"action":"open","items":[0,3]}'::jsonb;END IF;
 IF v->>'phase'<>'playing' THEN RETURN NULL;END IF;
 cards:=v->'tableaus'->actor->'cards';
 card:=CASE WHEN v->'pending'<>'null'::jsonb THEN (v#>>'{pending,card}')::integer ELSE (v->>'discardTop')::integer END;
 candidate_action:=CASE WHEN v->'pending'<>'null'::jsonb THEN 'replace' ELSE 'discard' END;
 -- Public endgame / stalemate pressure and completed-hole standings influence
 -- the value of resolving an unknown. They do not expose its actual value.
 IF v->>'finalReason' IS NOT NULL THEN urgency:=0.75;
 ELSIF (v->>'consecutiveNoRevealTurns')::integer>=4*jsonb_array_length(v->'players') THEN urgency:=0.5;END IF;
 IF (v->'scores'->>actor)::integer>(SELECT min(value::integer) FROM jsonb_each_text(v->'scores')) THEN urgency:=urgency+0.25;END IF;
 next_cards:=v->'tableaus'->(v->'players'->(((v->>'turnIndex')::integer+1)%jsonb_array_length(v->'players'))->>'id')->'cards';
 FOR i IN 0..5 LOOP
  peer:=CASE WHEN i<3 THEN i+3 ELSE i-3 END;
  -- Expected column score uses a uniform unknown rank, never a private card.
  IF cards->>i IS NULL AND cards->>peer IS NULL THEN before_i:=2*unknown_mean*12/13;
  ELSIF cards->>i IS NULL THEN before_i:=unknown_mean+private.golf_points((cards->>peer)::integer)-(2.0/13)*private.golf_points((cards->>peer)::integer);
  ELSIF cards->>peer IS NULL THEN before_i:=unknown_mean+private.golf_points((cards->>i)::integer)-(2.0/13)*private.golf_points((cards->>i)::integer);
  ELSE before_i:=CASE WHEN (cards->>i)::integer%13=(cards->>peer)::integer%13 THEN 0 ELSE private.golf_points((cards->>i)::integer)+private.golf_points((cards->>peer)::integer) END;END IF;
  IF cards->>peer IS NULL THEN after_i:=unknown_mean+private.golf_points(card)-(2.0/13)*private.golf_points(card);
  ELSE after_i:=CASE WHEN card%13=(cards->>peer)::integer%13 THEN 0 ELSE private.golf_points(card)+private.golf_points((cards->>peer)::integer) END;END IF;
  assistance:=CASE WHEN cards->>i IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(next_cards) c WHERE c IS NOT NULL AND c::integer%13=(cards->>i)::integer%13) THEN 0.5 ELSE 0 END;
  gain:=before_i-after_i-assistance+CASE WHEN cards->>i IS NULL THEN urgency ELSE 0 END;
  IF gain>best THEN best:=gain;best_i:=i;END IF;
 END LOOP;
 IF best>0 THEN RETURN jsonb_build_object('action',candidate_action,'items',jsonb_build_array(best_i));END IF;
 RETURN jsonb_build_object('action',CASE WHEN candidate_action='replace' THEN 'reject' ELSE 'draw' END,'items','[]'::jsonb);
END $$;

CREATE TABLE private.golf_integrity_failures (
 dealer_game_id uuid PRIMARY KEY, revision bigint NOT NULL, detected_at timestamptz NOT NULL DEFAULT clock_timestamp(), code text NOT NULL
);
ALTER TABLE private.golf_integrity_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.golf_integrity_failures FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.golf_schedule_bot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL OR NEW.state->>'phase' NOT IN ('opening','playing')
  OR NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id=(NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'id')::uuid AND (p.is_bot OR p.auto_fold) AND p.game_id=NEW.game_id) THEN NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' OR NEW.bot_due_at IS NULL THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER golf_bot_schedule BEFORE INSERT OR UPDATE ON private.golf_matches FOR EACH ROW EXECUTE FUNCTION private.golf_schedule_bot();

-- Canonical player intent remains the owner. Publish its public projection with
-- a new Golf revision; reconnect never silently cancels automatic play.
CREATE OR REPLACE FUNCTION private.golf_player_controls() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.golf_matches;g public.games;BEGIN
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type IS DISTINCT FROM 'six-card-golf' THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=g.current_game_uuid AND NOT finished;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=NEW.id::text) THEN RETURN NEW;END IF;
 UPDATE private.golf_matches SET player_controls=jsonb_set(player_controls,ARRAY[NEW.id::text],jsonb_build_object('autoPlay',NEW.auto_fold,'sitOutNextHand',NEW.sit_out_next_hand,'intentVersion',NEW.intent_version)),revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 RETURN NEW;
END $$;
CREATE TRIGGER golf_player_controls AFTER UPDATE ON public.players
 FOR EACH ROW WHEN(ROW(OLD.auto_fold,OLD.sit_out_next_hand,OLD.auto_play_stop_round_id,OLD.intent_version) IS DISTINCT FROM ROW(NEW.auto_fold,NEW.sit_out_next_hand,NEW.auto_play_stop_round_id,NEW.intent_version)) EXECUTE FUNCTION private.golf_player_controls();

CREATE OR REPLACE FUNCTION public.golf_reclaim_control(p_dealer_game_id uuid,p_round_id uuid,p_expected_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.golf_matches;p public.players;v jsonb;BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT * INTO p FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND NOT is_bot;
 IF NOT FOUND OR NOT private.golf_actor_allowed(auth.uid(),m.game_id,m.dealer_game_id)
  OR NOT EXISTS(SELECT FROM jsonb_array_elements(m.state->'players') x WHERE x->>'id'=p.id::text)
 THEN RAISE EXCEPTION 'golf:participant_required' USING ERRCODE='42501';END IF;
 -- Reuse canonical identity/version checks and clearing of deferred sit-out.
 -- Unlike dice, Golf has an authoritative boundary after each card action, so
 -- an unresolved private draw can safely be handed back without completing it.
 v:=public.set_automatic_play(m.game_id,p_round_id,m.dealer_game_id,p.id,p_expected_version,false);
 IF v->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'golf:stale_control';END IF;
 RETURN public.golf_snapshot(m.dealer_game_id);
END $$;

CREATE OR REPLACE FUNCTION private.golf_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
END $$;

-- Add Golf to the inspected Battle 31 / Race Poker v2 / 11 Up baseline.
-- Preserve every other branch, control, permission and financial owner.
DO $golf_registration$
DECLARE f record; original text; updated text; needle text; addition text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)','7b6ca8feaa35c1fcce8b00491783e9d4'),
  ('private.megatouch_frozen_stake()','66207ae4a79447ec634f8b3afaff9512')
 ) expected(signature,hash) LOOP
  original:=replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13)||chr(10),chr(10));
  IF md5(original) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'golf:registration_owner_drift:%',f.signature;END IF;
  IF f.signature='private.megatouch_frozen_stake()' THEN
   needle:=$before$,'battle-31')$before$;
   addition:=$after$,'battle-31','six-card-golf')$after$;
  ELSE
   needle:=$before$    WHEN v_game.game_type='farkle' THEN$before$;
   addition:=$after$    WHEN v_game.game_type='six-card-golf' THEN
      SELECT private.golf_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='farkle' THEN$after$;
  END IF;
  IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'golf:registration_anchor_count:%',f.signature;END IF;
  updated:=replace(original,needle,addition);
  EXECUTE updated;
 END LOOP;
END $golf_registration$;

DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('private','public') AND p.proname LIKE 'golf_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.golf_capabilities(uuid),public.golf_snapshot(uuid),public.golf_history(uuid),
 public.golf_action(uuid,uuid,uuid,bigint,text,integer[]),public.golf_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.golf_close(uuid),public.golf_revision_allowed(uuid,uuid),public.golf_reclaim_control(uuid,uuid,bigint) TO authenticated;
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.golf_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.golf_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER golf_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type='six-card-golf') EXECUTE FUNCTION private.golf_pause();
CREATE TRIGGER golf_publish AFTER INSERT OR UPDATE ON private.golf_matches FOR EACH ROW EXECUTE FUNCTION private.golf_publish();
-- Defaults do not activate discovery or match admission.
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
VALUES('six-card-golf','table',5,false,'none','auto_fold',true,false,false,0,0) ON CONFLICT(game_type) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_revisions;
SELECT cron.schedule('six-card-golf-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.golf_recover()$job$);