-- Test-only workload helpers. Install only after recovery_workload_probe.sql.
CREATE TABLE recovery_workload_probe.games (id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE);
CREATE TABLE recovery_workload_probe.actions (
  phase text NOT NULL, action text NOT NULL, round_id uuid NOT NULL, actor uuid NOT NULL,
  elapsed_ms numeric NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE recovery_workload_probe.hands (
  phase text NOT NULL, game_id uuid NOT NULL, dealer_game_id uuid NOT NULL, round_id uuid PRIMARY KEY,
  expected_hand integer NOT NULL, armed_at timestamptz NOT NULL
);
CREATE TABLE recovery_workload_probe.successors (
  round_id uuid PRIMARY KEY, xid xid8 NOT NULL, inserted_at timestamptz NOT NULL
);
CREATE FUNCTION recovery_workload_probe.capture_successor() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog' AS $capture$
BEGIN
  IF EXISTS(SELECT 1 FROM recovery_workload_probe.games WHERE id=NEW.game_id) THEN
    INSERT INTO recovery_workload_probe.successors VALUES(NEW.id,pg_current_xact_id(),clock_timestamp());
  END IF;
  RETURN NEW;
END;
$capture$;
CREATE TRIGGER recovery_workload_probe_successor AFTER INSERT ON public.rounds
FOR EACH ROW EXECUTE FUNCTION recovery_workload_probe.capture_successor();

CREATE FUNCTION recovery_workload_probe.seed_game() RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog','public','private' AS $seed$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()]; g uuid:=gen_random_uuid();
  d uuid:=gen_random_uuid(); p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); r jsonb; i integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.games) THEN RAISE EXCEPTION 'workload_seed:expected_empty'; END IF;
  FOR i IN 1..2 LOOP
    INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES(u[i],'authenticated','authenticated','workload-'||i||'@example.invalid',clock_timestamp(),
      '{"provider":"email","providers":["email"]}',jsonb_build_object('username','workload_'||i),clock_timestamp(),clock_timestamp());
    INSERT INTO public.profiles(id,username) VALUES(u[i],'workload_'||i)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username;
  END LOOP;
  UPDATE public.system_settings SET value=jsonb_set(coalesce(value,'{}'::jsonb),'{enabled}','false') WHERE key='harnesses_mode';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.games(id,name,game_type,status,real_money,ante_amount,buy_in,pot,current_round,total_hands,points_to_win,is_first_hand,current_host,dealer_position)
  VALUES(g,'Disposable recovery workload','gin-rummy','ante_decision',false,1,1000,0,NULL,0,100,true,u[1],1);
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(d,u[1],'gin-rummy',g,'{"points_to_win":100,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}');
  UPDATE public.games SET current_game_uuid=d WHERE id=g;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES(p1,u[1],g,1,0,false,'active','ante_up'),(p2,u[2],g,4,0,false,'active','ante_up');
  r:=public.start_gin_rummy_initial_hand(g);
  IF r->>'outcome'<>'started' THEN RAISE EXCEPTION 'workload_seed:bootstrap:%',r; END IF;
  INSERT INTO recovery_workload_probe.games VALUES(g);
  RETURN g;
END;
$seed$;

CREATE FUNCTION recovery_workload_probe.drive_hand() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog','public','private' AS $drive$
DECLARE g uuid; rd uuid; actor uuid; u uuid; s jsonb; card jsonb; result jsonb;
  started timestamptz; phase_label text; hand integer; before_count bigint;
  dealer_game uuid; predecessor recovery_workload_probe.hands%ROWTYPE;
BEGIN
  SELECT id INTO STRICT g FROM recovery_workload_probe.games;
  SELECT phase INTO phase_label FROM recovery_workload_probe.control WHERE singleton;
  SELECT r.id,r.hand_number,r.dealer_game_id INTO rd,hand,dealer_game FROM public.rounds r JOIN public.games game ON game.current_game_uuid=r.dealer_game_id
    WHERE game.id=g ORDER BY r.hand_number DESC,r.round_number DESC LIMIT 1;
  SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=rd;
  SELECT * INTO predecessor FROM recovery_workload_probe.hands WHERE game_id=g ORDER BY armed_at DESC LIMIT 1;
  IF FOUND AND (dealer_game IS DISTINCT FROM predecessor.dealer_game_id
      OR hand IS DISTINCT FROM predecessor.expected_hand OR rd=predecessor.round_id) THEN
    RAISE EXCEPTION 'workload_drive:wrong_successor_identity';
  END IF;
  IF EXISTS(SELECT 1 FROM recovery_workload_probe.hands WHERE round_id=rd) THEN
    RAISE EXCEPTION 'workload_drive:previous_hand_not_recovered';
  END IF;
  actor:=(s->>'nonDealerPlayerId')::uuid;
  SELECT user_id INTO u FROM public.players WHERE id=actor;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  started:=clock_timestamp();
  before_count:=(s->>'actionCount')::bigint;
  result:=public.gin_rummy_apply_action(rd,actor,'take_first_draw',NULL,NULL,(s->>'actionCount')::bigint);
  INSERT INTO recovery_workload_probe.actions VALUES(phase_label,'take_first_draw',rd,actor,extract(epoch FROM clock_timestamp()-started)*1000,clock_timestamp());
  SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=rd;
  IF (s->>'actionCount')::bigint IS DISTINCT FROM before_count+1 THEN
    RAISE EXCEPTION 'workload_drive:draw_not_committed:%',result;
  END IF;
  SELECT value INTO card FROM jsonb_array_elements(s->'playerStates'->actor::text->'hand')
    WHERE private.gin_card_key(value)<>private.gin_card_key(s->'lastAction'->'card') LIMIT 1;
  IF card IS NULL THEN RAISE EXCEPTION 'workload_drive:no_legal_discard'; END IF;
  started:=clock_timestamp();
  before_count:=(s->>'actionCount')::bigint;
  result:=public.gin_rummy_apply_action(rd,actor,'discard',card,NULL,(s->>'actionCount')::bigint);
  INSERT INTO recovery_workload_probe.actions VALUES(phase_label,'discard',rd,actor,extract(epoch FROM clock_timestamp()-started)*1000,clock_timestamp());
  SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=rd;
  IF (s->>'actionCount')::bigint IS DISTINCT FROM before_count+1 THEN
    RAISE EXCEPTION 'workload_drive:discard_not_committed:%',result;
  END IF;
  -- Deliberately accelerated fixture boundary, not simulated full-hand gameplay.
  s:=s||jsonb_build_object('phase','complete','winnerPlayerId',NULL,'completeDueAt',clock_timestamp()-interval '1 second');
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM private.gin_publish_state(rd,s);
  INSERT INTO recovery_workload_probe.hands VALUES(phase_label,g,dealer_game,rd,hand+1,clock_timestamp());
  RETURN jsonb_build_object('game',g,'round',rd,'expected_hand',hand+1);
END;
$drive$;
REVOKE ALL ON ALL TABLES IN SCHEMA recovery_workload_probe FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA recovery_workload_probe FROM PUBLIC,anon,authenticated,service_role;
