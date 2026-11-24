CREATE TEMP TABLE chess_existing_before(mode text,id uuid,parent uuid,state jsonb);
DO $existing$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];ids uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];g uuid:=gen_random_uuid();parent uuid;child uuid;d uuid;offer timestamptz:=clock_timestamp()+interval '10 minutes';h text;v jsonb;i int;
BEGIN
 FOR i IN 1..2 LOOP
 INSERT INTO auth.users(id) VALUES(users[i]);UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];UPDATE public.profiles SET is_active=true,username='Untimed existing fixture '||users[i] WHERE id=users[i];INSERT INTO private.chess_preview_users VALUES(users[i]);
 END LOOP;
 parent:=(pg_temp.chess_rpc(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,false,''[{"game":"chess","stake":7}]''::jsonb))',gen_random_uuid(),users[2]))#>>'{}')::uuid;
 SELECT offer_hash INTO h FROM private.delayed_matches WHERE id=parent;
 PERFORM pg_temp.chess_rpc(users[2],format('SELECT public.delayed_respond(%L,%L,%L,''accept'')',parent,gen_random_uuid(),h));
 INSERT INTO chess_existing_before SELECT 'async',id,match_id,state FROM private.delayed_children WHERE match_id=parent;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES(g,'game_selection',false,2,offer,0,false,false,users[1]);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],3-j,100,false FROM generate_series(1,2)j;
 v:=pg_temp.chess_rpc(users[1],format('SELECT public.chess_configure(%L,%L,2,''chess'',''{"ante_amount":5}''::jsonb,%L)',g,ids[1],offer));d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.chess_rpc(users[2],format('SELECT to_jsonb(public.submit_ante_decision(%L,%L,%L,''ante_up''))',g,d,ids[2]));
 INSERT INTO chess_existing_before SELECT 'live',dealer_game_id,game_id,state FROM private.chess_matches WHERE dealer_game_id=d;
END $existing$;
-- CANDIDATE
DO $converted$
DECLARE r record;s jsonb;c private.delayed_children;v jsonb;fp jsonb;failed boolean;
BEGIN
 FOR r IN SELECT * FROM chess_existing_before LOOP
 IF r.mode='async' THEN SELECT * INTO c FROM private.delayed_children WHERE id=r.id;s:=c.state;
 PERFORM pg_temp.chess_assert(c.expires_at IS NULL AND c.last_call_at IS NULL AND c.gameplay_due_at IS NULL,'existing Async deadlines cleared');
 ELSE SELECT state INTO s FROM private.chess_matches WHERE dealer_game_id=r.id;
 END IF;
 PERFORM pg_temp.chess_assert(s->>'timingPolicy'='play-money-untimed/1' AND s->>'deadline' IS NULL AND s->>'clockDuration'='0','existing game untimed');
 PERFORM pg_temp.chess_assert((s-ARRAY['timingPolicy','deadline','clockDuration','opened','turnStartedAt'])=(r.state-ARRAY['timingPolicy','deadline','clockDuration','opened','turnStartedAt']),'existing gameplay exactly retained');
 PERFORM pg_temp.chess_assert(private.chess_timeout_state(s)=s,'timeout reducer refuses untimed state');
 PERFORM private.chess_sync(r.mode,r.id);
 IF r.mode='async' THEN
  PERFORM pg_temp.chess_assert(NOT private.delayed_expire(r.id,c.segment,clock_timestamp()-interval '10 days'),'old expiry cannot terminate untimed');
  PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);v:=public.delayed_home(r.parent);
  PERFORM pg_temp.chess_assert(v#>>'{lineup,0,playable}'='true' AND v#>>'{lineup,0,untimed}'='true','untimed lobby admits actor');
  failed:=false;
  BEGIN PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',CASE WHEN c.actor=(SELECT organizer FROM private.delayed_matches WHERE id=c.match_id) THEN (SELECT opponent FROM private.delayed_matches WHERE id=c.match_id) ELSE (SELECT organizer FROM private.delayed_matches WHERE id=c.match_id) END,'{}');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:untimed' THEN RAISE;END IF;failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'outcome authority rejects timeout forfeiture');
  PERFORM pg_temp.chess_assert(NOT EXISTS(SELECT FROM private.push_events WHERE match_id=c.match_id AND kind='last_call' AND created_at>=statement_timestamp()),'no new Last Call event');
 ELSE
  UPDATE public.games SET is_paused=true WHERE id=r.parent;
  UPDATE public.games SET is_paused=false WHERE id=r.parent;
  PERFORM pg_temp.chess_assert((SELECT state->>'deadline' IS NULL AND state->>'phase'='playing' FROM private.chess_matches WHERE dealer_game_id=r.id),'Live resume keeps untimed board valid');
 END IF;
 END LOOP;
END $converted$;

