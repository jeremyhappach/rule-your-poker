-- Execute inside a rollback transaction, after the candidate (twice) or installed DDL.
CREATE FUNCTION pg_temp.activity_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Async activity: %',label;END IF;END $$;
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();u uuid;m uuid;req uuid;e uuid;
 c private.delayed_children;h jsonb;before_row jsonb;answer jsonb;real_i boolean;tie_i boolean;i integer;bank jsonb;start_board jsonb;fold jsonb;
BEGIN
 FOREACH u IN ARRAY ARRAY[a,b,outsider] LOOP
  INSERT INTO auth.users(id) VALUES(u);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=u;
  UPDATE public.profiles SET is_active=true WHERE id=u;
 END LOOP;
 PERFORM pg_temp.activity_check(has_function_privilege('authenticated','public.delayed_lobby()','EXECUTE')
  AND NOT has_function_privilege('anon','public.delayed_lobby()','EXECUTE')
  AND NOT has_function_privilege('service_role','public.delayed_lobby()','EXECUTE'),'explicit authenticated-only grant');
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP FOREACH tie_i IN ARRAY ARRAY[false,true] LOOP
  PERFORM set_config('request.jwt.claim.sub',a::text,true);req:=gen_random_uuid();
  m:=public.delayed_create(req,b,real_i,'[{"game":"quintzee","stake":5}]');
  PERFORM pg_temp.activity_check(public.delayed_create(req,b,real_i,'[{"game":"quintzee","stake":5}]')=m,'duplicate invitation');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  PERFORM pg_temp.activity_check(EXISTS(SELECT FROM jsonb_array_elements(public.delayed_lobby()->'matches') x WHERE x->>'id'=m::text AND x->>'status'='invited'),'incoming invitation visible');
  PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  PERFORM pg_temp.activity_check(EXISTS(SELECT FROM jsonb_array_elements(public.delayed_lobby()->'matches') x WHERE x->>'id'=m::text AND x->>'status'='active'),'active turn visible');
  answer:=private.delayed_record_outcome(c.id,c.revision,CASE WHEN tie_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT tie_i THEN a END,'{"proof":"activity"}');
  PERFORM pg_temp.activity_check(private.delayed_record_outcome(c.id,c.revision,CASE WHEN tie_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT tie_i THEN a END,'{"proof":"activity"}')=answer,'duplicate and late outcome replay');
  PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
  SELECT x INTO h FROM jsonb_array_elements(public.delayed_lobby()->'matches') x WHERE x->>'id'=m::text;
  RESET ROLE;
  PERFORM pg_temp.activity_check(h->>'status'='settled' AND h#>>'{lineup,0,viewed}'='false' AND h->>'finaleViewed'='false','settled game review stays reachable');
  SELECT id INTO e FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child';
  BEGIN PERFORM public.delayed_finale_ack(m);RAISE EXCEPTION 'early finale';EXCEPTION WHEN SQLSTATE '55000' THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  PERFORM pg_temp.activity_check(public.delayed_lobby()->'matches'='[]'::jsonb,'outsider has no matches');
  BEGIN PERFORM public.delayed_review_ack(e);RAISE EXCEPTION 'outsider ACK';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  PERFORM public.delayed_review_ack(e);PERFORM public.delayed_review_ack(e);
  SELECT x INTO h FROM jsonb_array_elements(public.delayed_lobby()->'matches') x WHERE x->>'id'=m::text;
  PERFORM pg_temp.activity_check(h->>'reviewsComplete'='true' AND h->>'finaleViewed'='false','viewed game retains unread match finale');
  SELECT to_jsonb(ch) INTO before_row FROM private.delayed_children ch WHERE id=c.id;
  PERFORM public.delayed_lobby();PERFORM public.delayed_lobby();
  PERFORM pg_temp.activity_check(before_row=(SELECT to_jsonb(ch) FROM private.delayed_children ch WHERE id=c.id),'reads preserve gameplay');
  PERFORM public.delayed_finale_ack(m);PERFORM public.delayed_finale_ack(m);
  PERFORM pg_temp.activity_check(NOT EXISTS(SELECT FROM jsonb_array_elements(public.delayed_lobby()->'matches') x WHERE x->>'id'=m::text),'final ACK removes only completed work');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  PERFORM pg_temp.activity_check(EXISTS(SELECT FROM jsonb_array_elements(public.delayed_lobby()->'matches') x WHERE x->>'id'=m::text),'other viewer remains independent');
  PERFORM pg_temp.activity_check((SELECT count(*)=2 AND sum(chips)=0 AND sum(abs(chips))=CASE WHEN tie_i THEN 0 ELSE 10 END FROM public.players WHERE game_id=m),'canonical winner/tie chips');
  PERFORM pg_temp.activity_check((SELECT count(*)=2 AND sum(chips)=0 FROM public.session_player_snapshots WHERE game_id=m),'canonical final snapshots');
  PERFORM pg_temp.activity_check(NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=m AND unmatched_deltas<>'{}'::jsonb),'balanced ledger');
 END LOOP;END LOOP;
 -- Real admission owners, more than the historical list's page size.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 FOR i IN 1..31 LOOP m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"quintzee","stake":5}]');END LOOP;
 PERFORM pg_temp.activity_check(jsonb_array_length(public.delayed_lobby()->'matches')=31,'pending work is never hidden behind history pagination');
 -- Existing shared Chucky rule owner: faces are disclosed only by a committed fold.
 start_board:=private.chucky_showdown_deal_v2(jsonb_build_object('runId',gen_random_uuid(),'config',jsonb_build_object('maxFolds',3,'maxCracks',3),'round',0,'hand',0,'status','active','score',0,'results','[]'::jsonb),true,1000);
 start_board:=start_board||'{"phase":"fold_stay","folds":1,"risk":1200}'::jsonb;
 PERFORM pg_temp.activity_check(jsonb_array_length(private.chucky_showdown_scene_v2(start_board)->'community')=2,'pre-fold hidden cards stay private');
 bank:=private.chucky_showdown_act_v2(start_board,'fold',null,2000);fold:=bank->'lastFold';
 PERFORM pg_temp.activity_check(bank->>'phase'='round_over' AND bank->>'reason'='folds' AND bank->>'score'='1200','bank remains server owned');
 PERFORM pg_temp.activity_check(fold->'community'=start_board->'community' AND fold->'player'=start_board->'player' AND jsonb_array_length(fold->'community')=4,'committed rabbit and own cards available');
 PERFORM pg_temp.activity_check(private.originals_visible('chucky-showdown',bank)->'lastFold'=fold,'Async shares exact committed fold receipt');
END $$;
SELECT 'PASS: invitation/turn/game/finale, >30 matches, per-viewer ACKs, winner/tie both modes, canonical finance, replay, outsider and Chucky disclosure' AS proof;
