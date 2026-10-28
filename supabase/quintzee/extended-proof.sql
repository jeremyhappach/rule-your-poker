-- Candidate and fixtures must be transaction contained by the caller.
SET LOCAL statement_timeout='60s';
DO $$ DECLARE mismatches bigint; BEGIN
 WITH dice AS (SELECT jsonb_build_array(1+n%6,1+(n/6)%6,1+(n/36)%6,1+(n/216)%6,1+(n/1296)%6) d FROM generate_series(0,7775) n)
 SELECT count(*) INTO mismatches FROM dice CROSS JOIN unnest(private.quintzee_v1_categories()) c
 WHERE private.quintzee_v1_category_score(c,d) IS DISTINCT FROM private.yahtzee_category_score('{"scores":{}}', (SELECT jsonb_agg(jsonb_build_object('value',v)) FROM jsonb_array_elements(d) v),c);
 PERFORM pg_temp.quintzee_assert(mismatches=0,'all 93,312 frozen category scores equal qualified no-joker rules');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.quintzee_fixture(n integer,bot boolean DEFAULT false,theme text DEFAULT 'modern',money boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g uuid:=gen_random_uuid();u uuid[]:=ARRAY[]::uuid[];p uuid[]:=ARRAY[]::uuid[];i integer;d uuid;v jsonb;offer timestamptz:=clock_timestamp()+interval '10 minutes';
BEGIN
 FOR i IN 1..n LOOP
  u:=array_append(u,gen_random_uuid());p:=array_append(p,gen_random_uuid());
  INSERT INTO auth.users(id) VALUES(u[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Quintzee qualification '||u[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',money,n,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT p[j],g,u[j],n+1-j,100,bot AND j>1 FROM generate_series(1,n) j;
 PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
 v:=public.quintzee_configure(g,p[1],n,'quintzee',jsonb_build_object('ante_amount',5,'theme',theme),offer);d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.quintzee_accept(g,d);
 RETURN jsonb_build_object('game',g,'dealer',d,'users',to_jsonb(u),'players',to_jsonb(p));
END $$;
DO $$ DECLARE f jsonb;g uuid;d uuid;n integer;winner_count integer;ids uuid[];expected jsonb;totals jsonb;i integer;original jsonb;after_state jsonb;rev bigint;solo jsonb; BEGIN
 FOR n IN 2..4 LOOP FOR winner_count IN 1..n LOOP
  f:=pg_temp.quintzee_fixture(n);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(f->'players');
  SELECT state INTO original FROM private.quintzee_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.quintzee_assert(original->>'theme'='modern' AND original->'rules'=private.quintzee_v1_rules(),'theme and rule freeze');
  UPDATE public.game_defaults SET quintzee_theme='classic' WHERE game_type='quintzee';
  PERFORM pg_temp.quintzee_assert((SELECT state=original FROM private.quintzee_matches WHERE dealer_game_id=d),'defaults cannot alter an admitted match');
  BEGIN UPDATE public.dealer_games SET config=config||'{"theme":"classic"}' WHERE id=d;RAISE EXCEPTION 'missing frozen config';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'megatouch:configuration_frozen' THEN RAISE;END IF;END;
  totals:='{}';FOR i IN 1..n LOOP totals:=totals||jsonb_build_object(ids[i]::text,CASE WHEN i<=winner_count THEN 100 ELSE 0 END);END LOOP;
  expected:=private.split_whole_chips_clockwise(g,ids[1:winner_count],(n-winner_count)*5,n);
  UPDATE private.quintzee_matches SET state=state||jsonb_build_object('phase','complete','scores',totals) WHERE dealer_game_id=d;
  PERFORM private.quintzee_settle(d);PERFORM private.quintzee_settle(d);SET CONSTRAINTS ALL IMMEDIATE;
  FOR i IN 1..n LOOP PERFORM pg_temp.quintzee_assert((SELECT chips=100+CASE WHEN i<=winner_count THEN coalesce((expected->>ids[i]::text)::int,0) ELSE -5 END FROM public.players WHERE id=ids[i]),'2/3/4-player exact canonical tie allocation');END LOOP;
  PERFORM pg_temp.quintzee_assert((SELECT sum(chips)=n*100 FROM public.players WHERE game_id=g),'canonical conservation');
  PERFORM pg_temp.quintzee_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'exactly one result');
  PERFORM pg_temp.quintzee_assert((SELECT count(*)=n FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id AND p.chips=s.chips WHERE s.dealer_game_id=d),'all final chip snapshots');
  IF winner_count<n THEN PERFORM pg_temp.quintzee_assert((SELECT count(*)=1 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'one balanced transfer batch');END IF;
  SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;
 BEGIN PERFORM pg_temp.quintzee_fixture(2,false,'classic',true);RAISE EXCEPTION 'missing real-money rejection';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'quintzee:fake_money_only' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.quintzee_fixture(2,false,'invalid');RAISE EXCEPTION 'missing theme rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:theme' THEN RAISE;END IF;END;
 f:=pg_temp.quintzee_fixture(3,true);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_reduce(state,'tick',NULL,(state->>'deadline')::bigint) WHERE dealer_game_id=d;
 SELECT state INTO original FROM private.quintzee_matches WHERE dealer_game_id=d;
 UPDATE public.games SET is_paused=true WHERE id=g;
 UPDATE private.quintzee_matches SET paused_at=paused_at-1500 WHERE dealer_game_id=d;
 PERFORM private.quintzee_recover();
 PERFORM pg_temp.quintzee_assert((SELECT state=original AND bot_due_at IS NULL FROM private.quintzee_matches WHERE dealer_game_id=d),'pause blocks bots and recovery');
 UPDATE public.games SET is_paused=false WHERE id=g;
 SELECT state,revision INTO after_state,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.quintzee_assert((after_state#>>'{core,board,deadline}')::bigint-(original#>>'{core,board,deadline}')::bigint>=1500 AND after_state->'scores'=original->'scores','pause preserves clock and scores');
 PERFORM pg_sleep(1.6);
 PERFORM private.quintzee_recover();
 PERFORM pg_temp.quintzee_assert((SELECT revision=rev+1 AND state IS DISTINCT FROM after_state FROM private.quintzee_matches WHERE dealer_game_id=d),'visible-input bot advances without browser');
 PERFORM private.quintzee_recover();
 PERFORM pg_temp.quintzee_assert((SELECT revision=rev+1 FROM private.quintzee_matches WHERE dealer_game_id=d),'bot cannot advance twice before next due');
 UPDATE public.game_defaults SET quintzee_theme='modern' WHERE game_type='quintzee';
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 solo:=public.arcade_start((f#>>'{users,0}')::uuid,gen_random_uuid(),'quintzee');
 PERFORM pg_temp.quintzee_assert(solo#>>'{config,theme}'='modern','Arcade admits selected theme');
 UPDATE public.game_defaults SET quintzee_theme='classic' WHERE game_type='quintzee';
 PERFORM pg_temp.quintzee_assert((SELECT config->>'theme'='modern' FROM private.arcade_runs WHERE id=(solo->>'id')::uuid),'Arcade theme immutable across default edits');
END $$;
SELECT 'Quintzee extended qualification passed' AS proof;
