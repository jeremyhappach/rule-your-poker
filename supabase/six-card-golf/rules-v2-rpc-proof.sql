-- Actual RPCs, locks, receipts, pause/recovery and frozen configuration at the new boundary.
CREATE TEMP TABLE golf_v2_review_frames(label text, snapshot jsonb) ON COMMIT DROP;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];ids uuid[];
 g uuid;d uuid;offer timestamptz;v jsonb;prior jsonb;m private.golf_matches;before_i jsonb;req uuid;rev bigint;round_i uuid;
 n integer;i integer;actor uuid;trigger_actor text;
BEGIN
 FOR i IN 1..4 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Threshold '||users[i],true);
 END LOOP;
 FOR n IN 2..4 LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '30 minutes';
  INSERT INTO public.games(id,status,current_host,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',users[1],false,4,offer,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[x],g,users[x],5-x,100,false FROM generate_series(1,n)x;
  PERFORM pg_temp.golf_login(users[1]);v:=public.golf_configure(g,ids[1],4,'six-card-golf','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
  FOR i IN 2..n LOOP PERFORM pg_temp.golf_login(users[i]);PERFORM public.submit_ante_decision(g,d,ids[i],'ante_up');END LOOP;
  LOOP
   SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.golf_assert(m.state#>>'{rules,version}'='six-card-golf/2','new admission freezes /2');
   actor:=(m.state->'players'->(m.state->>'turnIndex')::integer->>'userId')::uuid;PERFORM pg_temp.golf_login(actor);
   EXIT WHEN m.state->>'phase'='playing' AND jsonb_array_length(m.state->'stock')=n+1 AND m.state->'pending'='null';
   v:=public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,CASE WHEN m.state->>'phase'='opening' THEN 'open' WHEN m.state->'pending'='null' THEN 'draw' ELSE 'reject' END,CASE WHEN m.state->>'phase'='opening' THEN ARRAY[0,3] END);
  END LOOP;
  req:=gen_random_uuid();rev:=m.revision;round_i:=m.round_id;trigger_actor:=m.state->'players'->(m.state->>'turnIndex')::integer->>'id';
  v:=public.golf_action(d,round_i,req,rev,'draw');prior:=public.golf_action(d,round_i,req,rev,'draw');
  IF n=3 THEN INSERT INTO golf_v2_review_frames VALUES('threshold-pending',public.golf_snapshot(d));END IF;
  PERFORM pg_temp.golf_assert(v->'receipt'=prior->'receipt' AND v->'revision'=prior->'revision','threshold draw replay is exact');
  SELECT state INTO before_i FROM private.golf_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.golf_login(users[1]);PERFORM public.set_game_paused(g,true,d,(SELECT pause_version FROM public.games WHERE id=g));
  UPDATE private.golf_matches SET paused_at=paused_at-100000 WHERE dealer_game_id=d;
  PERFORM private.golf_recover();
  PERFORM pg_temp.golf_assert((SELECT state=before_i FROM private.golf_matches WHERE dealer_game_id=d),'paused threshold cannot consume turn or score');
  PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
  SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.golf_assert(m.state->>'stockFinalTrigger'=trigger_actor AND m.state->'pending'=before_i->'pending','resume preserves latch and private pending card');
  PERFORM pg_temp.golf_login(actor);req:=gen_random_uuid();rev:=m.revision;
  v:=public.golf_action(d,round_i,req,rev,'reject');prior:=public.golf_action(d,round_i,req,rev,'reject');
  IF n=3 THEN INSERT INTO golf_v2_review_frames VALUES('threshold-final-queue',public.golf_snapshot(d));END IF;
  PERFORM pg_temp.golf_assert(v->'receipt'=prior->'receipt' AND v->'revision'=prior->'revision' AND jsonb_array_length(v->'finalQueue')=n AND v->'finalQueue'->>-1=trigger_actor,'trigger turn replay cannot consume final queue');
  FOR i IN 1..n LOOP
   SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.golf_login((m.state->'players'->(m.state->>'turnIndex')::integer->>'userId')::uuid);
   v:=public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,'draw');
   SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
   v:=public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,'reject');
  END LOOP;
  PERFORM pg_temp.golf_assert(v->>'phase'='hole_complete' AND jsonb_array_length(v->'holes')=1,'RPC queue scores exactly one hole');
  PERFORM pg_temp.golf_login(actor);prior:=public.golf_action(d,round_i,req,rev,'reject');
  PERFORM pg_temp.golf_assert(prior->'receipt'=v->'receipt' IS NOT TRUE,'late trigger receipt is not the final receipt');
  PERFORM pg_temp.golf_assert((SELECT jsonb_array_length(state->'holes')=1 AND settlement IS NULL FROM private.golf_matches WHERE dealer_game_id=d),'late trigger replay neither scores nor settles again');
 END LOOP;
END $$;
SELECT 'Golf /2 threshold RPC replay, pending pause/recovery, queue completion and late replay passed' proof;
