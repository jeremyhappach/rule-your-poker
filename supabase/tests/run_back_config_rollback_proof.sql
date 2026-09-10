-- Run inside a caller-owned transaction and always ROLLBACK.
-- Synthetic setup boundaries only: this proves config preservation, not wins.
DO $proof$
DECLARE
  users uuid[];
  test_case jsonb;
  game_id uuid;
  first_player uuid;
  next_player uuid;
  deadline timestamptz;
  source_result jsonb;
  successor_result jsonb;
  repeated jsonb;
  saved_config jsonb;
BEGIN
  SELECT array_agg(id) INTO users FROM (SELECT id FROM public.profiles ORDER BY created_at,id LIMIT 2) p;
  IF cardinality(users) <> 2 THEN RAISE EXCEPTION 'run_back_proof:two_profiles_required'; END IF;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  FOR test_case IN SELECT value FROM jsonb_array_elements('[
    {"type":"yahtzee","config":{"ante_amount":10}},
    {"type":"horses","config":{"ante_amount":11}},
    {"type":"ship-captain-crew","config":{"ante_amount":13}},
    {"type":"holm-game","config":{"ante_amount":12,"leg_value":4,"legs_to_win":5,"pussy_tax_enabled":false,"pussy_tax_value":0,"pot_max_enabled":false,"pot_max_value":0,"chucky_cards":7,"rabbit_hunt":true}},
    {"type":"3-5-7","config":{"ante_amount":12,"rollover_amount":6,"leg_value":4,"legs_to_win":5,"pussy_tax_enabled":false,"pussy_tax_value":0,"pot_max_enabled":false,"pot_max_value":0,"reveal_at_showdown":true}},
    {"type":"gin-rummy","config":{"ante_amount":9,"points_to_win":50,"per_point_value":0,"gin_bonus":17,"undercut_bonus":21}},
    {"type":"cribbage","config":{"ante_amount":10,"points_to_win":37,"game_mode":"custom","custom_points_to_win":37,"skunk_enabled":false,"skunk_threshold":0,"double_skunk_enabled":false,"double_skunk_threshold":0}},
    {"type":"cribbage","config":{"ante_amount":10,"points_to_win":121,"game_mode":"custom","custom_points_to_win":121,"skunk_enabled":false,"skunk_threshold":0,"double_skunk_enabled":false,"double_skunk_threshold":0}},
    {"type":"cribbage","config":{"ante_amount":8,"points_to_win":121,"game_mode":"full","skunk_enabled":true,"skunk_threshold":91,"double_skunk_enabled":true,"double_skunk_threshold":61}}
  ]'::jsonb) LOOP
    game_id := gen_random_uuid(); deadline := clock_timestamp()+interval '20 minutes';
    INSERT INTO public.games(id,name,real_money,status,current_host,dealer_position,config_complete,config_deadline,ante_decision_timer_seconds,pot,total_hands)
      VALUES(game_id,'Codex rollback Run Back config',false,'game_selection',users[1],1,false,deadline,30,0,0);
    INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot,sitting_out)
      VALUES(game_id,users[1],1,100,'active',false,false) RETURNING id INTO first_player;
    INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot,sitting_out)
      VALUES(game_id,users[2],2,100,'active',false,false) RETURNING id INTO next_player;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
    PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
    source_result := public.configure_dealer_game(game_id,first_player,1,test_case->>'type',test_case->'config',deadline);
    saved_config := source_result#>'{dealer_game,config}';
    IF saved_config IS NULL THEN RAISE EXCEPTION 'run_back_proof:missing_source'; END IF;

    -- Simulate the next setup boundary within this uncommitted test fixture.
    deadline := deadline + interval '1 hour';
    UPDATE public.games SET status='game_selection',config_complete=false,config_deadline=deadline,
      dealer_position=2,current_game_uuid=NULL WHERE id=game_id;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[2])::text,true);
    PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
    successor_result := public.configure_dealer_game(game_id,next_player,2,test_case->>'type',saved_config,deadline);
    IF successor_result#>'{dealer_game,config}' IS DISTINCT FROM saved_config
      OR successor_result#>>'{dealer_game,id}' = source_result#>>'{dealer_game,id}'
      OR successor_result#>>'{game,status}' <> 'ante_decision' THEN
      RAISE EXCEPTION 'run_back_proof:config_mismatch:%',test_case;
    END IF;
    repeated := public.configure_dealer_game(game_id,next_player,2,test_case->>'type',saved_config,deadline);
    IF repeated->>'outcome' <> 'already_configured' OR repeated#>>'{dealer_game,id}' <> successor_result#>>'{dealer_game,id}' THEN
      RAISE EXCEPTION 'run_back_proof:duplicate:%',test_case;
    END IF;
  END LOOP;
END;
$proof$;
