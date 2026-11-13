-- Run after the candidate DDL inside BEGIN/ROLLBACK, or after installation
-- inside BEGIN READ ONLY/ROLLBACK. Existing games remain unchanged.
DO $proof$
DECLARE c record;who uuid;v jsonb;v2 jsonb;before_writes bigint;after_writes bigint;n int:=0;denied boolean;outsider uuid; counts jsonb:='[]';h jsonb;old_other int;actual_other int;
BEGIN
 SELECT coalesce(sum(n_tup_ins+n_tup_upd+n_tup_del),0) INTO before_writes FROM pg_stat_xact_user_tables;
 SELECT id INTO outsider FROM auth.users u WHERE NOT EXISTS(SELECT FROM private.delayed_matches m WHERE u.id IN(m.organizer,m.opponent)) LIMIT 1;
 FOR c IN SELECT ch.*,m.organizer,m.opponent FROM private.delayed_children ch JOIN private.delayed_matches m ON m.id=ch.match_id WHERE ch.game_type='chess' AND m.status IN('active','settled') AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id) LOOP
  FOREACH who IN ARRAY ARRAY[c.organizer,c.opponent] LOOP
   PERFORM set_config('request.jwt.claim.sub',who::text,true);
   v:=public.delayed_chess_inspect(c.id);v2:=public.delayed_chess_inspect(c.id);
   IF v->>'fen' IS DISTINCT FROM c.state->>'fen' OR v->'moves' IS DISTINCT FROM c.state->'moves' OR (v->>'revision')::bigint<>c.revision OR (v->>'viewerId')::uuid<>who OR v->'identity' IS DISTINCT FROM c.state->'identity' THEN RAISE EXCEPTION 'projection mismatch';END IF;
   IF (v-'serverAt') IS DISTINCT FROM (v2-'serverAt') THEN RAISE EXCEPTION 'inspection replay changed state';END IF;
   IF c.terminal AND (v->>'canAct')::boolean THEN RAISE EXCEPTION 'terminal action admitted';END IF;
   IF NOT c.terminal AND NOT (v->>'paused')::boolean AND (v->>'canAct')::boolean IS DISTINCT FROM (c.actor=who) THEN RAISE EXCEPTION 'turn ownership mismatch';END IF;
   n:=n+1;
  END LOOP;
  IF outsider IS NOT NULL THEN
   PERFORM set_config('request.jwt.claim.sub',outsider::text,true);denied:=false;
   BEGIN PERFORM public.delayed_chess_inspect(c.id);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
   IF NOT denied THEN RAISE EXCEPTION 'outsider allowed';END IF;
  END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);denied:=false;
  BEGIN PERFORM public.delayed_chess_inspect(c.id);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'anonymous allowed';END IF;
 END LOOP;
 IF n=0 THEN RAISE EXCEPTION 'missing real Chess fixtures';END IF;
 IF has_function_privilege('anon','public.delayed_chess_inspect(uuid)','execute') OR has_function_privilege('service_role','public.delayed_chess_inspect(uuid)','execute') OR NOT has_function_privilege('authenticated','public.delayed_chess_inspect(uuid)','execute') THEN RAISE EXCEPTION 'wrong execution grants';END IF;
 FOR c IN SELECT m.* FROM private.delayed_matches m WHERE status='active' AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id) LOOP
  FOREACH who IN ARRAY ARRAY[c.organizer,c.opponent] LOOP
   PERFORM set_config('request.jwt.claim.sub',who::text,true);h:=public.delayed_home(c.id);
   SELECT count(*) FILTER(WHERE (x->>'playable')::boolean),count(*) INTO old_other,actual_other FROM jsonb_array_elements(h->'lineup') x WHERE NOT (x->>'terminal')::boolean AND (x->>'actor')::uuid<>who AND (coalesce(x->>'playableDeadline',x->>'expiresAt'))::timestamptz>statement_timestamp() AND NOT (h->>'held')::boolean;
   counts:=counts||jsonb_build_array(jsonb_build_object('oldOpponentCount',old_other,'correctOpponentCount',actual_other,'games',(SELECT jsonb_agg(x->>'game') FROM jsonb_array_elements(h->'lineup')x)));
  END LOOP;
 END LOOP;
 SELECT coalesce(sum(n_tup_ins+n_tup_upd+n_tup_del),0) INTO after_writes FROM pg_stat_xact_user_tables;
 IF after_writes<>before_writes THEN RAISE EXCEPTION 'inspection wrote table data';END IF;
 PERFORM set_config('ptown.inspect.proof',jsonb_build_object('viewerReads',n,'zeroTableWrites',true,'authorization',true,'replay',true,'realLobbyCounts',counts)::text,true);
END $proof$;
SELECT current_setting('ptown.inspect.proof')::jsonb AS proof;
