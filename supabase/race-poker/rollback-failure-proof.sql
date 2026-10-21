-- Included only inside the production-proof builder's BEGIN/ROLLBACK envelope.
CREATE TEMP TABLE race_fault_games(id uuid PRIMARY KEY) ON COMMIT DROP;
CREATE FUNCTION pg_temp.race_failure_after_chips() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.race_fault_games WHERE id=NEW.game_id) THEN
  IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN
   RAISE EXCEPTION 'race_proof:injection_before_chips';
  END IF;
  RAISE EXCEPTION 'race_proof:injected_after_chips';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER race_proof_failure BEFORE INSERT ON public.session_player_snapshots
 FOR EACH ROW EXECUTE FUNCTION pg_temp.race_failure_after_chips();
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];people uuid[];g uuid;d uuid;offer timestamptz;v jsonb;i integer;money integer;
BEGIN
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Race rollback proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOR money IN 0..1 LOOP
  g:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO pg_temp.race_fault_games VALUES(g);
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
   VALUES(g,'game_selection',money=1,2,offer,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot)
   SELECT people[n],g,users[n],3-n,100,false FROM generate_series(1,2)n;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  v:=public.race_poker_configure(g,people[1],2,'race-poker','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.race_accept(g,d);
  UPDATE private.race_poker_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object(people[1]::text,48000,people[2]::text,45000)) WHERE dealer_game_id=d;
  BEGIN
   PERFORM private.race_poker_settle(d);
   RAISE EXCEPTION 'race_proof:missing_injected_failure';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'race_proof:injected_after_chips' THEN RAISE;END IF;
  END;
  PERFORM pg_temp.race_assert((SELECT bool_and(chips=100) FROM public.players WHERE game_id=g),'injected failure restores both balances');
  PERFORM pg_temp.race_assert(NOT EXISTS(SELECT 1 FROM public.game_results WHERE dealer_game_id=d),'failure removes result');
  PERFORM pg_temp.race_assert(NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'failure removes journal');
  PERFORM pg_temp.race_assert(NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE dealer_game_id=d),'failure removes snapshots');
  PERFORM pg_temp.race_assert((SELECT settlement IS NULL FROM private.race_poker_matches WHERE dealer_game_id=d),'failure removes claim');
  PERFORM pg_temp.race_assert((SELECT status='in_progress' FROM public.games WHERE id=g),'failure preserves active lifecycle');
 END LOOP;
END $$;
