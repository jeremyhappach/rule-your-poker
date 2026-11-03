-- Run inside BEGIN/ROLLBACK; installed qualification uses BEGIN READ ONLY.
-- Existing matches are inspected only. No rack, identity or match data is emitted.
DO $$
DECLARE r record; who uuid; outsider uuid; v jsonb; rows_seen int:=0;
 active_views int:=0; terminal_views int:=0; own_views int:=0; waiting_views int:=0;
 reads_before jsonb; reads_after jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.delayed_words_inspect(uuid)'::regprocedure
   AND provolatile='s' AND prosecdef AND proconfig=ARRAY['search_path=""'])
 THEN RAISE EXCEPTION 'inspection function attributes differ';END IF;
 IF NOT has_function_privilege('authenticated','public.delayed_words_inspect(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.delayed_words_inspect(uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.delayed_words_inspect(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'inspection ACL mismatch';END IF;
 SELECT jsonb_agg(jsonb_build_array(relid,n_tup_ins,n_tup_upd,n_tup_del) ORDER BY relid)
 INTO reads_before FROM pg_stat_xact_user_tables WHERE schemaname IN('auth','public','private');
 FOR r IN SELECT c.*,m.organizer,m.opponent FROM private.delayed_children c
 JOIN private.delayed_matches m ON m.id=c.match_id
 WHERE c.game_type='ptown-words' AND m.status IN('active','settled')
 AND NOT EXISTS(SELECT 1 FROM private.delayed_removals d WHERE d.match_id=m.id)
 AND private.delayed_human(m.organizer) AND private.delayed_human(m.opponent)
 ORDER BY c.id LIMIT 12 LOOP
  FOREACH who IN ARRAY ARRAY[r.organizer,r.opponent] LOOP
   PERFORM set_config('request.jwt.claim.sub',who::text,true);
   SET LOCAL ROLE authenticated;
   SELECT public.delayed_words_inspect(r.id) INTO v;
   RESET ROLE;
   IF v->>'viewerId'<>who::text OR v#>>'{identity,dealerGameId}'<>r.id::text
    OR v#>>'{identity,sessionId}'<>r.match_id::text OR (v->>'revision')::bigint<>r.revision
    OR v->'board' IS DISTINCT FROM r.state->'board' OR v->'rack' IS DISTINCT FROM r.state->'racks'->who::text
    OR v->'scores' IS DISTINCT FROM r.state->'scores' OR v ?| ARRAY['racks','bag']
    OR (v->>'finished')::boolean IS DISTINCT FROM r.terminal
    OR (v->>'canAct')::boolean IS DISTINCT FROM (NOT r.terminal AND NOT private.delayed_held(r.match_id) AND r.actor=who)
    OR (v->>'deadline')::numeric IS DISTINCT FROM floor(extract(epoch FROM r.expires_at)*1000)
   THEN RAISE EXCEPTION 'inspection projection mismatch';END IF;
   rows_seen:=rows_seen+1;
   IF r.terminal THEN terminal_views:=terminal_views+1;ELSE active_views:=active_views+1;END IF;
   IF r.actor=who THEN own_views:=own_views+1;ELSE waiting_views:=waiting_views+1;END IF;
  END LOOP;
  SELECT p.id INTO outsider FROM public.profiles p
   WHERE p.id NOT IN(r.organizer,r.opponent) AND private.delayed_human(p.id) LIMIT 1;
  IF outsider IS NULL THEN RAISE EXCEPTION 'missing outsider for membership proof';END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.delayed_words_inspect(r.id);
   RAISE EXCEPTION 'outsider inspection allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub','',true);
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.delayed_words_inspect(r.id);
   RAISE EXCEPTION 'anonymous inspection allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
 END LOOP;
 IF rows_seen=0 THEN RAISE EXCEPTION 'no eligible hosted Words projection';END IF;
 SELECT jsonb_agg(jsonb_build_array(relid,n_tup_ins,n_tup_upd,n_tup_del) ORDER BY relid)
 INTO reads_after FROM pg_stat_xact_user_tables WHERE schemaname IN('auth','public','private');
 IF reads_before IS DISTINCT FROM reads_after THEN RAISE EXCEPTION 'inspection wrote database state';END IF;
 PERFORM set_config('ptown.words_inspection_proof',jsonb_build_object('passed',true,
  'views',rows_seen,'active',active_views,'terminal',terminal_views,'owner',own_views,'opponent',waiting_views,
  'private_rack_only',true,'membership_denied',true,'anonymous_denied',true,'zero_table_writes',true,
  'read_only_transaction',current_setting('transaction_read_only'))::text,true);
END $$;
SELECT current_setting('ptown.words_inspection_proof')::jsonb AS proof;
