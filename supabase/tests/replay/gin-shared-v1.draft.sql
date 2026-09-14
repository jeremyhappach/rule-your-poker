-- Gin qualification only. Called after the existing authoritative game lock.
CREATE OR REPLACE FUNCTION private.replay_gin_roster_v1(_game uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('playerId',id,'userId',user_id,'seat',position,'isBot',is_bot,'status',status,
  'participation',to_jsonb(p)-ARRAY['id','game_id','user_id','position','is_bot','status','chips','authority_revision','chip_transfer_cursor']) ORDER BY position,id),'[]')
 FROM public.players p WHERE game_id=_game;
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_shared_begin_v1(_game uuid,_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE c jsonb;s jsonb;r uuid;b jsonb;ending jsonb;
BEGIN
 IF coalesce(current_setting('app.replay_gin_shared_root',true),'')<>'' THEN RETURN NULL; END IF;
 -- One reverse primary-key lookup, then one round primary-key lookup. No
 -- scanning/sorting every previous hand as a session grows.
 SELECT (body #>> '{identity,roundId}')::uuid,body #> '{closing,endingState}' INTO r,ending FROM private.replay_steps
 WHERE session_id=_game ORDER BY sequence DESC LIMIT 1;
 SELECT gr.replay_context_v1,gr.state INTO c,s FROM private.gin_rummy_round_states gr WHERE gr.round_id=r;
 IF c IS NULL THEN RETURN NULL; END IF;
 IF ending IS NOT NULL THEN c:=jsonb_set(c,'{checkpoint}',ending-ARRAY['gameState','visibility','privateCatalog']); END IF;
 b:=private.replay_gin_state_v1(s,c);
 PERFORM set_config('app.replay_gin_shared_root',_source,true);
 RETURN jsonb_build_object('context',c,'before',b,'round',r,'source',_source);
END;
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_shared_end_v1(_capture jsonb,_operands jsonb,_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE c jsonb;b jsonb;a jsonb;s jsonb;g public.games;r public.rounds;bal jsonb;expected jsonb;edge jsonb;edges jsonb:='[]';
 d jsonb;actor text;closing jsonb;key text;amount bigint;from_key text;to_key text;seq bigint;
 parts jsonb:='[]';cards jsonb;previous jsonb;middle jsonb;
BEGIN
 IF _capture IS NULL THEN RETURN; END IF;
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
 IF d='[]'::jsonb THEN RETURN; END IF;
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
 SELECT value->>'playerId' INTO actor FROM jsonb_array_elements(a->'roster') WHERE value->>'userId'=auth.uid()::text LIMIT 1;
 previous:=b;
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
  parts||jsonb_build_array(jsonb_build_object('type','session.'||split_part(_capture->>'source','.',2),'source',_capture->>'source',
   'actorId',actor,'targets',coalesce(jsonb_path_query_array(_operands,'$.p_player_id'),'[]'),'origin',CASE WHEN actor IS NULL THEN 'system' ELSE 'player' END,
   'operands',_operands,'delta',d,'scores','[]'::jsonb,'transfers',edges)),closing);
 c:=jsonb_set(c,'{checkpoint}',a-ARRAY['gameState','visibility','privateCatalog']);
 UPDATE private.gin_rummy_round_states SET replay_context_v1=c WHERE round_id=r.id;
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_roster_v1(uuid),private.replay_gin_shared_begin_v1(uuid,text),private.replay_gin_shared_end_v1(jsonb,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
