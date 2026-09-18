CREATE OR REPLACE FUNCTION private.replay_gin_open_v1(_game games, _round rounds, _state jsonb, _rules jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_live_started timestamptz := CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END;  v_context jsonb; v_cards jsonb; v_players jsonb; v_users jsonb; v_balances jsonb; v_identity jsonb; v_origins jsonb;
BEGIN
  IF _game.replay_contract_version IS NULL THEN PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN; END IF;
  SELECT jsonb_agg(jsonb_build_object('playerId',id,'userId',user_id,'seat',position,'isBot',is_bot,'status',status) ORDER BY position,id),
         jsonb_object_agg(id::text,user_id),jsonb_object_agg('player:'||id::text,chips),jsonb_object_agg(id::text,CASE WHEN is_bot THEN 'bot' ELSE 'player' END)
    INTO v_players,v_users,v_balances,v_origins FROM public.players WHERE game_id=_game.id;
  SELECT jsonb_object_agg(private.gin_card_key(card),gen_random_uuid()::text) INTO v_cards
    FROM (SELECT value card FROM jsonb_array_elements((_state->'stockPile')||(_state->'discardPile'))
          UNION ALL SELECT card.value FROM jsonb_each(_state->'playerStates') p CROSS JOIN LATERAL jsonb_array_elements(p.value->'hand') card) cards;
  v_identity := jsonb_build_object('sessionId',_game.id,'dealerGameId',_round.dealer_game_id,'handNumber',_round.hand_number,'roundId',_round.id);
  v_context := jsonb_build_object('identity',v_identity,'cardIds',v_cards,'users',v_users,'origins',v_origins,
    'checkpoint',jsonb_build_object('captureContract','gin-replay/1','lifecycleCaptureContract','gin-lifecycle/2','roster',private.replay_gin_roster_v1(_game.id),'session',to_jsonb(_game)-ARRAY['replay_contract_version','authority_revision','chip_transfer_cursor','pot_transfer_cursor'],
      'round',to_jsonb(_round)-ARRAY['gin_rummy_state','authority_revision'],'rules',jsonb_build_object('contract','gin-rummy/1','config',_rules),
      'balances',v_balances||jsonb_build_object('pot',_game.pot),'scores',_state->'matchScores'));
  INSERT INTO private.replay_streams(session_id,contract,coverage,writer_contract)
    VALUES(_game.id,'ptown-replay/1','hand_boundary','gin-replay/1') ON CONFLICT(session_id) DO NOTHING;
  UPDATE private.gin_rummy_round_states SET replay_context_v1=v_context WHERE round_id=_round.id;
  PERFORM private.replay_append_v1(_game.id,'gin:'||_round.id::text||':opening',v_identity,
    jsonb_build_object('state',private.replay_gin_state_v1(_state,v_context),'coverage','hand_boundary','rules',v_context #> '{checkpoint,rules}','trigger',coalesce(nullif(current_setting('app.replay_gin_opening_cause',true),'')::jsonb,'null'::jsonb)),'[]');
PERFORM private.replay_live_timing_finish_v1(v_live_started);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.replay_gin_postgame_v1(_game uuid, _round uuid, _result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_live_started timestamptz := CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END;  v_before jsonb;v_after jsonb;v_identity jsonb;v_game public.games;v_round public.rounds;v_roster jsonb;v_balances jsonb;v_actor text;v_sub jsonb;
BEGIN
 SELECT body #> '{closing,endingState}',body->'identity' INTO v_before,v_identity FROM private.replay_steps
  WHERE session_id=_game AND body #>> '{identity,roundId}'=_round::text AND body ? 'closing' ORDER BY sequence DESC LIMIT 1;
 IF v_before IS NULL THEN RAISE EXCEPTION 'replay_v1:postgame_without_closing'; END IF;
 SELECT * INTO v_game FROM public.games WHERE id=_game;
 SELECT * INTO v_round FROM public.rounds WHERE id=_round;
 SELECT jsonb_agg(jsonb_build_object('playerId',id,'userId',user_id,'seat',position,'isBot',is_bot,'status',status) ORDER BY position,id),
  jsonb_object_agg('player:'||id::text,chips)||jsonb_build_object('pot',v_game.pot) INTO v_roster,v_balances FROM public.players WHERE game_id=_game;
 IF v_balances IS DISTINCT FROM v_before->'balances' THEN RAISE EXCEPTION 'replay_v1:unrecorded_postgame_finance'; END IF;
 SELECT value->>'playerId' INTO v_actor FROM jsonb_array_elements(v_before->'roster') WHERE value->>'userId'=auth.uid()::text LIMIT 1;
 v_after:=v_before||jsonb_build_object('session',private.replay_gin_game_envelope_v1(v_game),'round',to_jsonb(v_round)-ARRAY['gin_rummy_state','authority_revision'],'roster',private.replay_gin_roster_v1(_game));
 v_sub:=jsonb_build_object('type','gin.postgame','source','public.gin_rummy_advance_postgame','actorId',v_actor,'targets','[]'::jsonb,
  'origin',CASE WHEN v_actor IS NULL THEN 'system' ELSE 'player' END,'operands',_result,'delta',private.replay_diff_v1(v_before,v_after),'scores','[]'::jsonb,'transfers','[]'::jsonb);
 PERFORM private.replay_append_v1(_game,'gin:'||_round||':postgame',v_identity,NULL,jsonb_build_array(v_sub),jsonb_build_object(
  'scope','hand','identity',v_identity,'disposition',v_game.status,'writerContract',v_before->>'captureContract','completeness',CASE WHEN v_before->>'captureContract'='gin-replay/1' THEN 'complete' ELSE 'partial' END,'endingState',v_after,'balances',v_balances,'scores',v_after->'scores'));
PERFORM private.replay_live_timing_finish_v1(v_live_started);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.replay_gin_shared_begin_v1(_game uuid, _source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_live_started timestamptz := CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END; v_live_result jsonb;  c jsonb;s jsonb;r uuid;b jsonb;ending jsonb;
BEGIN
 IF coalesce(current_setting('app.replay_gin_shared_root',true),'')<>'' THEN v_live_result := NULL; PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN v_live_result; END IF;
 -- One reverse primary-key lookup, then one round primary-key lookup. No
 -- scanning/sorting every previous hand as a session grows.
 SELECT (body #>> '{identity,roundId}')::uuid,body #> '{closing,endingState}' INTO r,ending FROM private.replay_steps
 WHERE session_id=_game ORDER BY sequence DESC LIMIT 1;
 SELECT gr.replay_context_v1,gr.state INTO c,s FROM private.gin_rummy_round_states gr WHERE gr.round_id=r;
 IF c IS NULL THEN v_live_result := NULL; PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN v_live_result; END IF;
 IF ending IS NOT NULL THEN c:=jsonb_set(c,'{checkpoint}',ending-ARRAY['gameState','visibility','privateCatalog']); END IF;
 b:=private.replay_gin_state_v1(s,c);
 PERFORM set_config('app.replay_gin_shared_root',_source,true);
 v_live_result := jsonb_build_object('context',c,'before',b,'round',r,'source',_source); PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN v_live_result;
PERFORM private.replay_live_timing_finish_v1(v_live_started);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.replay_gin_shared_end_v1(_capture jsonb, _operands jsonb, _result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_live_started timestamptz := CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END;  c jsonb;b jsonb;a jsonb;s jsonb;g public.games;r public.rounds;bal jsonb;expected jsonb;edge jsonb;edges jsonb:='[]';
 d jsonb;actor text;closing jsonb;key text;amount bigint;from_key text;to_key text;seq bigint;
 parts jsonb:='[]';cards jsonb;previous jsonb;middle jsonb;
BEGIN
 IF _capture IS NULL THEN PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN; END IF;
 -- An enclosing ante action can open a new hand. Its opening checkpoint owns
 -- that committed boundary; never append the predecessor after that opening.
 IF (SELECT body #>> '{identity,roundId}' FROM private.replay_steps
     WHERE session_id=(_capture #>> '{context,identity,sessionId}')::uuid ORDER BY sequence DESC LIMIT 1)
    IS DISTINCT FROM _capture->>'round' THEN
  PERFORM set_config('app.replay_gin_shared_root','',true); PERFORM set_config('app.replay_gin_opening_cause','',true); PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN;
 END IF;
 c:=_capture->'context';b:=_capture->'before';
 SELECT * INTO g FROM public.games WHERE id=(c #>> '{identity,sessionId}')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'replay_v1:captured_session_deleted'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=(_capture->>'round')::uuid;
 SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=r.id;
 SELECT jsonb_object_agg('player:'||id::text,chips)||jsonb_build_object('pot',g.pot) INTO bal FROM public.players WHERE game_id=g.id;
 a:=private.replay_gin_state_v1(s,c)||jsonb_build_object('session',private.replay_gin_game_envelope_v1(g),
  'round',to_jsonb(r)-ARRAY['gin_rummy_state','authority_revision'],'roster',private.replay_gin_roster_v1(g.id),'balances',bal);
 d:=private.replay_diff_v1(b,a);
 PERFORM set_config('app.replay_gin_shared_root','',true);
 IF d='[]'::jsonb THEN PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN; END IF;
 expected:=b->'balances';
 FOR key IN SELECT jsonb_object_keys(bal) LOOP
  IF NOT expected ? key THEN expected:=expected||jsonb_build_object(key,0); END IF;
 END LOOP;
 FOR edge IN SELECT value FROM jsonb_array_elements(coalesce(_operands->'p_transfers','[]')) LOOP
  amount:=(edge->>'amount')::bigint;
  from_key:=CASE WHEN edge #>> '{from,kind}'='pot' THEN 'pot' ELSE 'player:'||(edge #>> '{from,playerId}') END;
  to_key:=CASE WHEN edge #>> '{to,kind}'='pot' THEN 'pot' ELSE 'player:'||(edge #>> '{to,playerId}') END;
  expected:=jsonb_set(expected,ARRAY[from_key],to_jsonb((expected->>from_key)::bigint-amount));
  expected:=jsonb_set(expected,ARRAY[to_key],to_jsonb((expected->>to_key)::bigint+amount));
  edges:=edges||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from',from_key,'to',to_key,'amount',amount,'reason',_operands->>'p_reason'));
 END LOOP;
 IF expected IS DISTINCT FROM bal THEN RAISE EXCEPTION 'replay_v1:unrecorded_shared_finance'; END IF;
 actor:=_capture->>'actorId';
 previous:=b;
 IF _capture ? 'anteDecisionRoster' THEN
  middle:=jsonb_set(previous,'{roster}',_capture->'anteDecisionRoster');
  parts:=parts||jsonb_build_array(jsonb_build_object('type','session.ante_decision','source',_capture->>'source','actorId',actor,
   'targets',jsonb_build_array(_operands->'p_player_id'),'origin',CASE WHEN actor IS NULL THEN 'system' ELSE 'player' END,
   'operands',_operands,'delta',private.replay_diff_v1(previous,middle),'scores','[]'::jsonb,'transfers','[]'::jsonb));
  previous:=middle;
 END IF;
 FOR cards IN SELECT value FROM jsonb_array_elements(coalesce(_capture->'dealerDrawRounds','[]')) LOOP
  middle:=jsonb_set(previous,'{session,dealer_selection_state}',jsonb_build_object('cards',cards,'isComplete',false,
   'preparedAt',a #> '{session,dealer_selection_state,preparedAt}'));
  parts:=parts||jsonb_build_array(jsonb_build_object('type','session.dealer_draw_round','source',_capture->>'source','actorId',NULL,
   'targets',(SELECT jsonb_agg(value->'playerId') FROM jsonb_array_elements(cards)),'origin','system','operands','{}'::jsonb,
   'delta',private.replay_diff_v1(previous,middle),'scores','[]'::jsonb,'transfers','[]'::jsonb));
  previous:=middle;
 END LOOP;
 d:=private.replay_diff_v1(previous,a);
 IF s->>'phase'='complete' THEN closing:=jsonb_build_object('scope','hand','identity',c->'identity','disposition',g.status,
  'writerContract',c #>> '{checkpoint,captureContract}','completeness',CASE WHEN c #>> '{checkpoint,captureContract}'='gin-replay/1' THEN 'complete' ELSE 'partial' END,'endingState',a,'balances',bal,'scores',a->'scores'); END IF;
 seq:=private.replay_append_v1(g.id,'gin:'||r.id||':shared:'||gen_random_uuid(),c->'identity',NULL,
  parts||jsonb_build_array(jsonb_build_object('type',CASE WHEN _capture->>'source'='public.configure_dealer_game' AND g.game_type IS DISTINCT FROM 'gin-rummy' THEN 'session.game_handoff' ELSE 'session.'||split_part(_capture->>'source','.',2) END,'source',_capture->>'source',
   'actorId',actor,'targets',coalesce(jsonb_path_query_array(_operands,'$.p_player_id'),'[]'),'origin',CASE WHEN actor IS NULL THEN 'system' ELSE 'player' END,
   'operands',_operands,'delta',d,'scores','[]'::jsonb,'transfers',edges)),closing);
 c:=jsonb_set(c,'{checkpoint}',a-ARRAY['gameState','visibility','privateCatalog']);
 IF s->>'phase'<>'complete' THEN UPDATE private.gin_rummy_round_states SET replay_context_v1=c WHERE round_id=r.id; END IF;
PERFORM private.replay_live_timing_finish_v1(v_live_started);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.replay_gin_transition_v1(_context jsonb, _before jsonb, _after jsonb, _actor uuid, _action text, _card jsonb, _meld_index integer, _middle jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_live_started timestamptz := CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END; 
 v_steps jsonb:='[]'; v_previous jsonb:=_before; v_scores jsonb; v_action text; v_target text; v_middle jsonb; v_item jsonb;
 v_automatic_draw boolean:=_middle IS NOT NULL AND jsonb_typeof(_middle)='object';
 v_finance_delta jsonb;v_envelope_delta jsonb:='[]';
 v_edges jsonb:=coalesce(nullif(current_setting('app.replay_gin_edges',true),'')::jsonb,'[]');
 v_delta jsonb; v_edge jsonb; v_balances jsonb:=_context #> '{checkpoint,balances}'; v_key text;
 v_closing jsonb; v_ending jsonb; v_game public.games; v_round public.rounds; v_seq bigint; v_actual_balances jsonb;
 v_origin text:=CASE WHEN _actor IS NULL OR _action='finalize_scoring' THEN 'system' ELSE coalesce(_context->'origins'->>_actor::text,'player') END;
BEGIN
 IF _context IS NULL THEN RAISE EXCEPTION 'replay_v1:missing_gin_opening'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(CASE WHEN v_automatic_draw THEN
  jsonb_build_array(jsonb_build_object('type','pass_first_draw','state',_middle)) ELSE coalesce(_middle,'[]') END) LOOP
  v_middle:=v_item->'state';
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','gin.'||(v_item->>'type'),'source','private.gin_apply_action_core','actorId',_actor,
   'targets',CASE WHEN _action='lay_off' THEN (SELECT jsonb_agg(key) FROM jsonb_each(_before->'playerStates') WHERE (value->>'hasKnocked')::boolean)
     ELSE '[]'::jsonb END,'origin',v_origin,'operands',jsonb_build_object('action',_action,'card',_card,'meldIndex',_meld_index),
   'delta',private.replay_gin_delta_v1(v_previous,v_middle,_context),'transfers','[]'::jsonb,'scores','[]'::jsonb));
  v_previous:=v_middle;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('counter',a.key,'before',(v_previous->'matchScores'->>a.key)::integer,
  'after',a.value::integer,'delta',a.value::integer-(v_previous->'matchScores'->>a.key)::integer,'reason',_action) ORDER BY a.key),'[]')
 INTO v_scores FROM jsonb_each_text(_after->'matchScores') a WHERE a.value IS DISTINCT FROM v_previous->'matchScores'->>a.key;
 v_action:=CASE WHEN v_automatic_draw THEN 'automatic_draw_stock' WHEN _action IN ('finish_lay_off','finalize_scoring') THEN 'score_resolved' ELSE _action END;
 v_target:=CASE WHEN v_automatic_draw THEN _before->>'nonDealerPlayerId' ELSE _after->>'currentTurnPlayerId' END;
 IF _action='lay_off' THEN
  SELECT key INTO v_target FROM jsonb_each(_before->'playerStates') WHERE coalesce((value->>'hasKnocked')::boolean,false) LIMIT 1;
 ELSIF _action='knock' THEN
  v_target:=CASE WHEN _actor::text=_before->>'dealerPlayerId' THEN _before->>'nonDealerPlayerId' ELSE _before->>'dealerPlayerId' END;
 ELSIF _after->>'winnerPlayerId' IS NOT NULL THEN v_target:=_after->>'winnerPlayerId'; END IF;
 v_delta:=private.replay_gin_delta_v1(v_previous,_after,_context);
 FOR v_edge IN SELECT value FROM jsonb_array_elements(v_edges) LOOP
  FOREACH v_key IN ARRAY ARRAY[v_edge->>'from',v_edge->>'to'] LOOP
   v_balances:=jsonb_set(v_balances,ARRAY[v_key],to_jsonb((v_balances->>v_key)::bigint+
     CASE WHEN v_key=v_edge->>'from' THEN -(v_edge->>'amount')::bigint ELSE (v_edge->>'amount')::bigint END));
  END LOOP;
 END LOOP;
 v_finance_delta:=private.replay_diff_v1(_context #> '{checkpoint,balances}',v_balances,ARRAY['balances']);
 IF _after->>'phase'='complete' THEN
  -- Necessary ending checkpoint: one indexed read per entity, only at close.
  SELECT * INTO v_game FROM public.games WHERE id=(_context #>> '{identity,sessionId}')::uuid;
  SELECT * INTO v_round FROM public.rounds WHERE id=(_context #>> '{identity,roundId}')::uuid;
  SELECT jsonb_object_agg('player:'||id::text,chips)||jsonb_build_object('pot',v_game.pot) INTO v_actual_balances FROM public.players WHERE game_id=v_game.id;
  IF v_actual_balances IS DISTINCT FROM v_balances THEN RAISE EXCEPTION 'replay_v1:unrecorded_financial_change'; END IF;
  v_ending:=private.replay_gin_state_v1(_after,_context)||jsonb_build_object('balances',v_balances,
    'session',private.replay_gin_game_envelope_v1(v_game),'round',to_jsonb(v_round)-ARRAY['gin_rummy_state','authority_revision'],'roster',private.replay_gin_roster_v1(v_game.id));
  v_envelope_delta:=private.replay_diff_v1(_context #> '{checkpoint,session}',v_ending->'session',ARRAY['session'])
    ||private.replay_diff_v1(_context #> '{checkpoint,round}',v_ending->'round',ARRAY['round'])
    ||private.replay_diff_v1(_context #> '{checkpoint,roster}',v_ending->'roster',ARRAY['roster']);
  v_closing:=jsonb_build_object('scope','hand','identity',_context->'identity','disposition',
    CASE WHEN _after->'knockResult'='null'::jsonb THEN 'void' WHEN _after->>'winnerPlayerId' IS NOT NULL THEN v_game.status ELSE 'scored' END,
    'writerContract',_context #>> '{checkpoint,captureContract}','completeness',CASE WHEN _context #>> '{checkpoint,captureContract}'='gin-replay/1' THEN 'complete' ELSE 'partial' END,'endingState',v_ending,'balances',v_balances,'scores',_after->'matchScores');
 END IF;
 v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','gin.'||v_action,'source','private.gin_apply_action_core',
  'actorId',CASE WHEN v_automatic_draw OR v_action='score_resolved' THEN NULL ELSE _actor END,'targets',CASE WHEN v_target IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_target) END,
  'origin',CASE WHEN v_automatic_draw OR v_action='score_resolved' THEN 'system' ELSE v_origin END,'operands',jsonb_build_object('action',v_action,'card',_card,'meldIndex',_meld_index),
  'delta',v_delta,'transfers','[]'::jsonb,'scores',v_scores));
 IF v_edges<>'[]'::jsonb THEN
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','financial.transfer','source','public.gin_rummy_settle_game_legacy',
   'actorId',NULL,'targets',jsonb_build_array(v_target),'origin','system','operands','{}'::jsonb,'delta',v_finance_delta,'transfers',v_edges,'scores','[]'::jsonb));
 END IF;
 IF v_closing IS NOT NULL THEN
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('type','gin.hand_closed','source','private.gin_apply_action_core',
   'actorId',NULL,'targets','[]'::jsonb,'origin','system','operands',jsonb_build_object('disposition',v_closing->'disposition'),
   'delta',v_envelope_delta,'transfers','[]'::jsonb,'scores','[]'::jsonb));
 END IF;
 v_seq:=private.replay_append_v1((_context #>> '{identity,sessionId}')::uuid,
   'gin:'||(_context #>> '{identity,roundId}')||':action:'||(_before->>'actionCount'),_context->'identity',NULL,v_steps,v_closing);
 PERFORM set_config('app.replay_gin_edges','',true);
PERFORM private.replay_live_timing_finish_v1(v_live_started);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.replay_gin_note_transfer_v1(_game games, _from uuid, _to uuid, _amount integer, _result uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_live_started timestamptz := CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END; 
BEGIN
 IF _game.replay_contract_version=1 AND _amount>0 THEN
  PERFORM set_config('app.replay_gin_edges',jsonb_build_array(jsonb_build_object('id',_result::text,
   'from','player:'||_from::text,'to','player:'||_to::text,'amount',_amount,'reason','gin_terminal_settlement'))::text,true);
 END IF;
PERFORM private.replay_live_timing_finish_v1(v_live_started);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.purge_quota_diagnostics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_debug_events bigint := 0;
  v_debug_sync_events bigint := 0;
  v_cron_successes bigint := 0;
  v_cron_failures bigint := 0;
BEGIN
  DELETE FROM public.debug_events
   WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS v_debug_events = ROW_COUNT;

  DELETE FROM public.debug_sync_events
   WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS v_debug_sync_events = ROW_COUNT;

  DELETE FROM cron.job_run_details
   WHERE status = 'succeeded'
     AND coalesce(end_time, start_time) < now() - interval '1 day';
  GET DIAGNOSTICS v_cron_successes = ROW_COUNT;

  DELETE FROM cron.job_run_details
   WHERE status IS DISTINCT FROM 'succeeded'
     AND status IS DISTINCT FROM 'running'
     AND coalesce(end_time, start_time) < now() - interval '7 days';
  GET DIAGNOSTICS v_cron_failures = ROW_COUNT;

  RETURN jsonb_build_object(
    'debug_events', v_debug_events,
    'debug_sync_events', v_debug_sync_events,
    'cron_successes', v_cron_successes,
    'cron_failures', v_cron_failures
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.purge_expired_diagnostics(_retention interval DEFAULT '1 day'::interval)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _cutoff timestamptz := now() - GREATEST(_retention, interval '1 day');
  _deleted bigint;
  _total bigint := 0;
BEGIN
  DELETE FROM public.chat_message_diagnostic_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.chat_diagnostic_sessions WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.chat_message_delivery_trace WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  UPDATE public.chat_messages m
  SET chat_operation_id = NULL
  FROM public.chat_send_operations o
  WHERE m.chat_operation_id = o.id::text
    AND o.created_at < _cutoff;
  DELETE FROM public.chat_operation_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.chat_send_operations WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  DELETE FROM public.client_runtime_event_outbox WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_incident_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_incidents WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_instances WHERE last_seen_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  DELETE FROM public.debug_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.debug_sync_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.game_state_debug_log WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.network_sim_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.sitting_out_debug_log WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.visual_bug_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  DELETE FROM public.dice_trace_samples WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.dice_trace_sessions WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.performance_traces WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.trace_sessions WHERE COALESCE(ended_at, started_at) < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.timing_debug_sessions WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_operation_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_operation_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_peer_witness_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_presence_heartbeats WHERE last_heartbeat_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_operation_incidents WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  RETURN _total;
END;
$function$
;
DROP FUNCTION private.replay_live_timing_start_v1();
