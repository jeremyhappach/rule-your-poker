-- Run after the candidate DDL inside BEGIN/ROLLBACK, or installed in READ ONLY.
DO $proof$
DECLARE c record;who uuid;v jsonb;again jsonb;before_rows text;after_rows text;n integer:=0;denied boolean;
BEGIN
 IF has_function_privilege('anon','public.delayed_match_record(uuid,uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.delayed_match_record(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.delayed_match_record(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'record:grants'; END IF;
 SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.delayed_matches t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.delayed_children t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY match_id) FROM private.delayed_settlements t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id,viewer) FROM private.delayed_review_seen t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY match_id,viewer) FROM private.delayed_finale_seen t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id,viewer) FROM private.delayed_review_playback t)
 )::text) INTO before_rows;
 FOR c IN SELECT DISTINCT ON(child.game_type) child.*,m.organizer,m.opponent
  FROM private.delayed_children child JOIN private.delayed_matches m ON m.id=child.match_id
  WHERE m.status='settled' AND child.terminal ORDER BY child.game_type,m.settled_at DESC LOOP
  FOREACH who IN ARRAY ARRAY[c.organizer,c.opponent] LOOP
   PERFORM set_config('request.jwt.claim.sub',who::text,true);
   SET LOCAL ROLE authenticated;
   v:=public.delayed_match_record(c.match_id,c.id);
   again:=public.delayed_match_record(c.match_id,c.id);
   RESET ROLE;
   IF v#>>'{home,id}'<>c.match_id::text OR v#>>'{detail,id}'<>c.id::text
    OR v#>>'{detail,game}'<>c.game_type OR v#>>'{home,status}'<>'settled'
    OR v#>'{home,receipt}' IS NULL OR v#>'{home,receipt}'='null'::jsonb
    OR (v-'home') IS DISTINCT FROM (again-'home')
    OR jsonb_array_length(v#>'{detail,attempts}')<>coalesce(jsonb_array_length(c.state->'attempts'),0)
   THEN RAISE EXCEPTION 'record:identity_or_replay:%',c.game_type; END IF;
   IF EXISTS(SELECT FROM jsonb_array_elements(v#>'{detail,attempts}') a WHERE
     a->'board' ?| ARRAY['deck','decks','salt','evidence','bag','racks'])
   THEN RAISE EXCEPTION 'record:private_randomness:%',c.game_type; END IF;
   IF c.game_type='chess' AND v#>>'{detail,board,fen}' IS DISTINCT FROM c.state->>'fen'
   THEN RAISE EXCEPTION 'record:chess_position'; END IF;
   IF c.game_type='five-alive' AND v#>'{detail,words,rounds}' IS DISTINCT FROM c.state#>'{fiveAlive,rounds}'
   THEN RAISE EXCEPTION 'record:words'; END IF;
   denied:=false;
   BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.delayed_match_record(c.match_id,gen_random_uuid());
   EXCEPTION WHEN insufficient_privilege THEN denied:=true;
   END;
   RESET ROLE;
   IF NOT denied THEN RAISE EXCEPTION 'record:foreign_child'; END IF;
   n:=n+1;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  denied:=false;
  BEGIN
   SET LOCAL ROLE authenticated;
   PERFORM public.delayed_match_record(c.match_id,c.id);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'record:outsider'; END IF;
 END LOOP;
 IF n<2 THEN RAISE EXCEPTION 'record:no_completed_fixtures'; END IF;
 FOR c IN SELECT id,organizer FROM private.delayed_matches WHERE status IN('active','invited') LIMIT 2 LOOP
  PERFORM set_config('request.jwt.claim.sub',c.organizer::text,true);denied:=false;
  BEGIN
   SET LOCAL ROLE authenticated;
   PERFORM public.delayed_match_record(c.id);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'record:sealed_active_match'; END IF;
 END LOOP;
 SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.delayed_matches t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.delayed_children t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY match_id) FROM private.delayed_settlements t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id,viewer) FROM private.delayed_review_seen t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY match_id,viewer) FROM private.delayed_finale_seen t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id,viewer) FROM private.delayed_review_playback t)
 )::text) INTO after_rows;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'record:writes_detected'; END IF;
 RAISE NOTICE 'PASS: % participant/game reads, duplicate reads, final state, privacy, active/outsider/child denial, unchanged records and ACKs',n;
END $proof$;
SELECT 'PASS: completed match records, authorization, privacy, repeated reads and no writes' AS result;
