-- Run after the existing core/financial/bot/fake-only proofs, inside rollback.
CREATE FUNCTION pg_temp.words_rpc(actor uuid,command text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE answer jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated; EXECUTE command INTO answer; RESET ROLE; RETURN answer;
END $$;
CREATE FUNCTION pg_temp.words_command(actor uuid,dealer uuid,revision bigint,action text,items jsonb DEFAULT NULL,request uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.words_rpc(actor,format('SELECT public.ptown_words_action(%L,%L,%L,%L,%L::jsonb)',dealer,request,revision,action,items))
$$;
DO $proof$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];ids uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 g uuid:=gen_random_uuid();d uuid;deadline timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;a jsonb;b jsonb;s jsonb;t jsonb;before_state jsonb;request uuid;target uuid;next_target uuid;revision bigint;i int;at_ms bigint;clock_before bigint;
BEGIN
 FOR i IN 1..3 LOOP INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Words banks proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;END LOOP;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES(g,'game_selection',false,2,deadline,0,false,false,users[1]);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,auto_ante,auto_ante_runback) SELECT ids[j],g,users[j],2*j,100,false,false,true FROM generate_series(1,3)j;
 v:=pg_temp.words_rpc(users[1],format('SELECT public.ptown_words_configure(%L,%L,2,%L,%L::jsonb,%L)',g,ids[1],'ptown-words','{"ante_amount":5}',deadline));d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);PERFORM pg_temp.words_accept(g,d);
 SELECT state INTO s FROM private.ptown_words_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.words_assert(s#>>'{rules,version}'='ptown-words/2' AND s#>>'{rules,timeBankUses}'='2','new admissions freeze /2 and two banks');
 SELECT (ordinal-1)::int INTO i FROM jsonb_array_elements(s->'players') WITH ORDINALITY x(p,ordinal) WHERE p->>'id'=ids[1]::text;
 UPDATE private.ptown_words_matches SET state=jsonb_set(state,'{turnIndex}',to_jsonb(i)),revision=ptown_words_matches.revision+1 WHERE dealer_game_id=d RETURNING state,ptown_words_matches.revision INTO s,revision;
 request:=gen_random_uuid();v:=pg_temp.words_command(users[1],d,revision,'time_bank','[{"slot":0}]',request);
 PERFORM pg_temp.words_assert(v=pg_temp.words_command(users[1],d,revision,'time_bank','[{"slot":0}]',request),'same UUID bank replay spends once');
 SELECT state INTO t FROM private.ptown_words_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.words_assert((t->>'deadline')::bigint=(s->>'deadline')::bigint+180000 AND t-'deadline'-'timeBankSpent'=s-'deadline'-'timeBankSpent','exact bank increment; all other gameplay state unchanged');
 UPDATE private.ptown_words_matches SET last_request_at=0 WHERE dealer_game_id=d;
 a:=pg_temp.words_command(users[1],d,(v->>'revision')::bigint,'time_bank','[{"slot":1}]');
 PERFORM pg_temp.words_assert((a->>'deadline')::bigint=(s->>'deadline')::bigint+360000 AND a->'timeBankSpent'->ids[1]::text='[0,1]'::jsonb,'both distinct bank slots consumed');
 BEGIN PERFORM pg_temp.words_command(users[1],d,(v->>'revision')::bigint,'time_bank','[{"slot":1}]');RAISE EXCEPTION 'missing stale';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:stale_revision' THEN RAISE;END IF;END;
 UPDATE private.ptown_words_matches SET last_request_at=0 WHERE dealer_game_id=d;
 PERFORM pg_temp.words_assert(pg_temp.words_command(users[1],d,(a->>'revision')::bigint,'time_bank','[{"slot":0}]')->>'error'='ptown_words:time_bank_used','spent bank rejected');
 BEGIN PERFORM pg_temp.words_command(users[2],d,(a->>'revision')::bigint,'time_bank','[{"slot":0}]');RAISE EXCEPTION 'missing turn guard';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'ptown_words:not_your_turn' THEN RAISE;END IF;END;
 v:=pg_temp.words_command(users[2],d,(a->>'revision')::bigint,'request_pause');target:=(v#>>'{pauseRequest,id}')::uuid;
 a:=pg_temp.words_command(users[2],d,(v->>'revision')::bigint,'request_pause');PERFORM pg_temp.words_assert(a->>'revision'=v->>'revision' AND a#>>'{pauseRequest,id}'=target::text,'repeat pause request is a no-op');
 request:=gen_random_uuid();revision:=(v->>'revision')::bigint;SELECT state INTO before_state FROM private.ptown_words_matches WHERE dealer_game_id=d;
 BEGIN PERFORM pg_temp.words_command(users[3],d,revision,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)));RAISE EXCEPTION 'missing ownership';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'ptown_words:pause_request_owner_required' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.words_command(gen_random_uuid(),d,revision,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)));RAISE EXCEPTION 'missing participant';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'ptown_words:participant_required' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.words_command(users[1],d,revision,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)));RAISE EXCEPTION 'missing host guard';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:cancel_request_unavailable' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.words_command(users[2],d,revision,'cancel_pause_request','[]');RAISE EXCEPTION 'missing target guard';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:cancel_request_target' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.words_command(users[2],d,revision-1,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)));RAISE EXCEPTION 'missing revision guard';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:stale_revision' THEN RAISE;END IF;END;
 a:=pg_temp.words_command(users[2],d,revision,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)),request);
 PERFORM pg_temp.words_assert(NOT(a?'pauseRequest') AND (a->>'revision')::bigint=revision+1 AND NOT(a->>'paused')::boolean,'own cancellation removes request only');
 PERFORM pg_temp.words_assert((SELECT state=before_state-'pauseRequest' FROM private.ptown_words_matches WHERE dealer_game_id=d),'cancellation preserves entire gameplay state');
 b:=pg_temp.words_command(users[2],d,revision,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)),request);PERFORM pg_temp.words_assert(b->>'revision'=a->>'revision','duplicate cancellation no additional revision');
 v:=pg_temp.words_command(users[2],d,(a->>'revision')::bigint,'request_pause');next_target:=(v#>>'{pauseRequest,id}')::uuid;
 b:=pg_temp.words_command(users[2],d,revision,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)),request);
 PERFORM pg_temp.words_assert(next_target<>target AND b#>>'{pauseRequest,id}'=next_target::text,'old command replay cannot erase a new request');
 BEGIN PERFORM pg_temp.words_command(users[2],d,(v->>'revision')::bigint,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',target)));RAISE EXCEPTION 'missing stale target';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:stale_pause_request' THEN RAISE;END IF;END;
 a:=pg_temp.words_rpc(users[2],format('SELECT public.set_game_paused(%L,true,%L,%L)',g,d,v->>'pauseVersion'));PERFORM pg_temp.words_assert(a->>'outcome'='not_authorized','guest cannot pause');
 a:=pg_temp.words_rpc(users[1],format('SELECT public.set_game_paused(%L,true,%L,%L)',g,d,v->>'pauseVersion'));PERFORM pg_temp.words_assert(a->>'outcome'='paused','canonical host pause');
 a:=pg_temp.words_command(users[2],d,(v->>'revision')::bigint,'cancel_pause_request',jsonb_build_array(jsonb_build_object('requestId',next_target)));
 PERFORM pg_temp.words_assert((a->>'paused')::boolean AND NOT(a?'pauseRequest'),'host-first cancel no-op never resumes');
 SELECT state INTO s FROM private.ptown_words_matches WHERE dealer_game_id=d;
 clock_before:=floor(extract(epoch FROM clock_timestamp())*1000);b:=pg_temp.words_rpc(users[1],format('SELECT public.set_game_paused(%L,false,%L,%L)',g,d,a->>'pauseVersion'));PERFORM pg_temp.words_assert(b->>'outcome'='resumed','canonical resume');
 SELECT state INTO t FROM private.ptown_words_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.words_assert((t->>'deadline')::bigint>=(s->>'deadline')::bigint AND t->'timeBankSpent'=s->'timeBankSpent' AND t->'racks'=s->'racks','resume preserves remaining time, rack and spent banks');
 v:=pg_temp.words_rpc(users[2],format('SELECT public.ptown_words_snapshot(%L)',d));v:=pg_temp.words_command(users[2],d,(v->>'revision')::bigint,'request_pause');
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);UPDATE public.games SET current_host=users[2] WHERE id=g;
 a:=pg_temp.words_rpc(users[2],format('SELECT public.ptown_words_snapshot(%L)',d));PERFORM pg_temp.words_assert(a->>'hostUserId'=users[2]::text AND NOT(a?'pauseRequest') AND (a->>'revision')::bigint>(v->>'revision')::bigint,'host transfer revises snapshot and retires request');
 s:=pg_temp.words_state('[{"id":0,"face":"C","value":3}]');s:=jsonb_set(s,'{rules}',private.ptown_words_rules_for('ptown-words/1'));
 t:=private.ptown_words_reduce(s,'pass',NULL,2000);PERFORM pg_temp.words_assert(t#>>'{rules,version}'='ptown-words/1','legacy /1 remains playable and frozen');
 BEGIN PERFORM private.ptown_words_reduce(s,'time_bank','[{"slot":0}]',2000);RAISE EXCEPTION 'missing legacy guard';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:time_bank_unavailable' THEN RAISE;END IF;END;
 s:=jsonb_set(s,'{rules}',private.ptown_words_rules());s:=jsonb_set(s,'{deadline}','2000');
 BEGIN PERFORM private.ptown_words_reduce(s,'time_bank','[{"slot":0}]',2000);RAISE EXCEPTION 'missing expiry';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:deadline' THEN RAISE;END IF;END;
 t:=private.ptown_words_reduce(s,'tick',NULL,2000);PERFORM pg_temp.words_assert((t->>'turn')::int=(s->>'turn')::int+1 AND NOT(t?'timeBankSpent'),'timeout passes without spending bank');
 PERFORM pg_temp.words_assert(NOT has_function_privilege('authenticated','private.ptown_words_rules_for(text)','EXECUTE'),'private rules helper remains inaccessible');
END $proof$;
