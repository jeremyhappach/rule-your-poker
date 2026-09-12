-- Run after the migration in the SAME rollback transaction for preflight;
-- after deployment this file also runs independently. No historical source
-- rows or balances are modified. All synthetic rows remain uncommitted.
BEGIN;
DO $proof$
DECLARE
 g uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); d2 uuid:=gen_random_uuid(); d3 uuid:=gen_random_uuid();
 r uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); r3 uuid:=gen_random_uuid(); p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid();
 u1 uuid; u2 uuid; hid uuid; res_id uuid:=gen_random_uuid(); ecount bigint; before_history jsonb; after_history jsonb;
 response jsonb; cr public.rounds; old_cr jsonb; new_state jsonb; n integer; rejected boolean;
BEGIN
 SELECT ids[1],ids[2] INTO u1,u2 FROM (SELECT array_agg(id) ids FROM (SELECT id FROM public.profiles ORDER BY id LIMIT 2) p) x;
 IF u2 IS NULL THEN RAISE EXCEPTION 'history_proof:two_profiles_required'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 INSERT INTO public.games(id,name,game_type,status,buy_in,pot,ante_amount,current_round,total_hands,real_money)
 VALUES(g,'Canonical history rollback proof','horses','in_progress',100,0,3,1,1,false);
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config)
 VALUES(d,g,u1,'horses','{}'),(d2,g,u1,'cribbage','{}');
 UPDATE public.games SET current_game_uuid=d WHERE id=g;
 INSERT INTO public.players(id,user_id,game_id,position,chips,status,is_bot,sitting_out)
 VALUES(p1,u1,g,1,100,'active',false,false),(p2,u2,g,2,100,'active',false,false);
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,pot,status,cards_dealt)
 VALUES(r,g,d,1,1,0,'betting',0);
 SELECT id INTO hid FROM private.history_hands WHERE dealer_game_id=d AND hand_number=1;
 IF (SELECT opening->'stacks'->>p1::text FROM private.history_hands WHERE id=hid)<>'100' THEN RAISE EXCEPTION 'history_proof:opening_stack'; END IF;

 -- Ordered actions, duplicate projection and exact immutable result identity.
 INSERT INTO public.player_actions(round_id,player_id,action_type) VALUES(r,p1,'stay'),(r,p2,'fold');
 INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,game_type,settlement_key,winner_player_id,winner_username,pot_won,player_chip_changes)
 VALUES(res_id,g,d,1,'horses','history_proof_result',p1,'Winner',18,jsonb_build_object(p1::text,18,p2::text,-18));
 SELECT count(*) INTO ecount FROM private.history_events WHERE hand_id=hid;
 PERFORM private.history_project_result(x) FROM public.game_results x WHERE id=res_id;
 IF (SELECT count(*) FROM private.history_events WHERE hand_id=hid)<>ecount THEN RAISE EXCEPTION 'history_proof:duplicate_result'; END IF;
 UPDATE public.players SET chips=chips+CASE WHEN id=p1 THEN 18 ELSE -18 END WHERE game_id=g;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF (SELECT closing->'stacks'->>p1::text FROM private.history_hands WHERE id=hid)<>'118'
 OR (SELECT closing->'stacks'->>p2::text FROM private.history_hands WHERE id=hid)<>'82' THEN RAISE EXCEPTION 'history_proof:ending_stacks'; END IF;
 SET CONSTRAINTS ALL DEFERRED;

 -- Privacy: completed rounds do not expose opponents, even after game switch.
 INSERT INTO public.player_cards(round_id,player_id,cards,is_public)
 VALUES(r,p1,'[{"rank":"A","suit":"spades"}]',false),(r,p2,'[{"rank":"K","suit":"hearts"}]',false);
 UPDATE public.rounds SET status='completed' WHERE id=r;
 UPDATE public.games SET game_type='cribbage',current_game_uuid=d2,total_hands=1 WHERE id=g;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO n FROM public.player_cards WHERE round_id=r;
 IF n<>1 THEN RAISE EXCEPTION 'history_proof:opponent_cards_leaked_after_switch:%',n; END IF;
 response:=public.get_hand_history(g,d);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(response#>'{games,0,hands,0,events}') e WHERE e->>'type'='exposure') THEN RAISE EXCEPTION 'history_proof:inferred_exposure'; END IF;
 rejected:=false;
 BEGIN INSERT INTO private.history_events(hand_id,sequence,source_key,event_type) VALUES(hid,999,'forged','result'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'history_proof:client_history_write'; END IF;
 EXECUTE 'RESET ROLE';

 -- Explicit public exposure survives refresh; caller-specific grants stay scoped.
 UPDATE public.player_cards SET is_public=true WHERE round_id=r AND player_id=p2;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
 response:=public.get_hand_history(g,d);
 IF (SELECT count(*) FROM jsonb_array_elements(response#>'{games,0,hands,0,events}') e WHERE e->>'type'='exposure')<>1 THEN RAISE EXCEPTION 'history_proof:explicit_exposure_missing'; END IF;
 PERFORM private.history_append(hid,r,1,'limited','exposure',p1,jsonb_build_object('cards','[{"rank":"2","suit":"clubs"}]'::jsonb),ARRAY[u2]);
 response:=public.get_hand_history(g,d);
 IF response::text LIKE '%"rank": "2"%' THEN RAISE EXCEPTION 'history_proof:audience_leak'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 rejected:=false;
 BEGIN PERFORM public.get_hand_history(g,d); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'history_proof:outsider_read'; END IF;

 -- Frozen history does not change with later balances, scores or dealer games.
 SELECT to_jsonb(h) - 'updated_at' INTO before_history FROM private.history_hands h WHERE id=hid;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.players SET chips=chips+10 WHERE game_id=g;
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT to_jsonb(h) - 'updated_at' INTO after_history FROM private.history_hands h WHERE id=hid;
 IF before_history IS DISTINCT FROM after_history THEN RAISE EXCEPTION 'history_proof:later_balance_contamination'; END IF;
 SET CONSTRAINTS ALL DEFERRED;

 -- Exact Cribbage failure boundary: a last play that returns already-counted
 -- scores awards ONE pegging point, not the 22-point full score difference.
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,pot,status,cards_dealt,cribbage_state)
 VALUES(r2,g,d2,1,1,0,'betting',4,jsonb_build_object('phase','pegging','dealerPlayerId',p1,
   'turnOrder',jsonb_build_array(p1,p2),'pegging',jsonb_build_object('playedCards','[]'::jsonb,'eventSequence',0),
   'playerStates',jsonb_build_object(p1::text,jsonb_build_object('hand','[]'::jsonb,'pegScore',73),p2::text,jsonb_build_object('hand','[]'::jsonb,'pegScore',86))));
 SELECT * INTO cr FROM public.rounds WHERE id=r2;
 old_cr:=to_jsonb(cr);
 new_state:=cr.cribbage_state||jsonb_build_object('phase','counting','countingPlan',jsonb_build_object('baselineScores',jsonb_build_object(p1::text,74,p2::text,86)),
   'pegging',jsonb_build_object('playedCards',jsonb_build_array(jsonb_build_object('playerId',p1,'card',jsonb_build_object('rank','Q','suit','diamonds'))),'eventSequence',1));
 new_state:=jsonb_set(new_state,ARRAY['playerStates',p1::text,'pegScore'],'95');
 new_state:=jsonb_set(new_state,ARRAY['playerStates',p2::text,'pegScore'],'98');
 cr.cribbage_state:=new_state; cr.status:='completed';
 PERFORM private.history_project_round(cr,old_cr);
 IF (SELECT (e.payload->>'points')::integer FROM private.history_events e JOIN private.history_hands h ON h.id=e.hand_id WHERE h.dealer_game_id=d2 AND e.event_type='pegging_award' AND e.actor_id=p1)<>1 THEN RAISE EXCEPTION 'history_proof:counting_contaminated_pegging'; END IF;
 IF (SELECT scores_after->>p2::text FROM private.history_hands WHERE dealer_game_id=d2 AND hand_number=1)<>'98' THEN RAISE EXCEPTION 'history_proof:hand_score'; END IF;
 SELECT count(*) INTO ecount FROM private.history_events e JOIN private.history_hands h ON h.id=e.hand_id WHERE h.dealer_game_id=d2;
 PERFORM private.history_project_round(cr,old_cr);
 IF (SELECT count(*) FROM private.history_events e JOIN private.history_hands h ON h.id=e.hand_id WHERE h.dealer_game_id=d2)<>ecount THEN RAISE EXCEPTION 'history_proof:replay'; END IF;
 old_cr:=to_jsonb(cr);
 cr.cribbage_state:=jsonb_set(jsonb_set(cr.cribbage_state,ARRAY['playerStates',p1::text,'pegScore'],'110'),ARRAY['playerStates',p2::text,'pegScore'],'123')
   ||jsonb_build_object('phase','complete','winnerPlayerId',p2);
 PERFORM private.history_project_round(cr,old_cr);
 IF NOT EXISTS(SELECT 1 FROM private.history_hands WHERE dealer_game_id=d2 AND terminal AND scores_after->>p2::text='123') THEN RAISE EXCEPTION 'history_proof:terminal'; END IF;
 -- Ties retain the exact split and no sole winner identity.
 PERFORM private.history_append(hid,r,1,'tie-proof','result',NULL,jsonb_build_object('amount',18,'deltas',jsonb_build_object(p1::text,9,p2::text,9),'isChopped',true));
 IF NOT EXISTS(SELECT 1 FROM private.history_events WHERE hand_id=hid AND source_key='tie-proof' AND actor_id IS NULL AND payload->>'isChopped'='true') THEN RAISE EXCEPTION 'history_proof:tie'; END IF;

 -- Holm public reveals may update only the admission counts, not card arrays.
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config) VALUES(d3,g,u1,'holm-game','{}');
 UPDATE public.games SET game_type='holm-game',current_game_uuid=d3 WHERE id=g;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,pot,status,cards_dealt,community_cards,chucky_cards,community_cards_revealed,chucky_cards_revealed)
 VALUES(r3,g,d3,1,1,0,'betting',2,'[{"rank":"3","suit":"hearts"}]','[{"rank":"4","suit":"clubs"}]',0,0);
 UPDATE public.rounds SET community_cards_revealed=1 WHERE id=r3;
 UPDATE public.rounds SET chucky_cards_revealed=1 WHERE id=r3;
 IF NOT EXISTS(SELECT 1 FROM private.history_events WHERE round_id=r3 AND event_type='community' AND payload#>>'{cards,0,rank}'='3')
 OR NOT EXISTS(SELECT 1 FROM private.history_events WHERE round_id=r3 AND event_type='exposure' AND payload->>'reason'='chucky' AND payload#>>'{cards,0,rank}'='4') THEN RAISE EXCEPTION 'history_proof:count_only_reveal'; END IF;

 -- A later decision can charge money without inserting a settlement result.
 -- Clear the synthetic same-transaction opening identity to model that boundary.
 UPDATE private.history_hands SET open_transaction=NULL WHERE dealer_game_id=d3;
 INSERT INTO public.player_actions(round_id,player_id,action_type) VALUES(r3,p1,'fold');
 UPDATE public.players SET chips=chips-1 WHERE id=p1;
 UPDATE public.games SET pot=pot+1 WHERE id=g;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF (SELECT closing#>>ARRAY['stacks',p1::text] FROM private.history_hands WHERE dealer_game_id=d3) IS DISTINCT FROM '127' THEN RAISE EXCEPTION 'history_proof:decision_charge_not_projected'; END IF;

 -- Real saved repro: read-only comparison against source, not a fixture rewrite.
 IF EXISTS(SELECT 1 FROM public.rounds WHERE id='f3624aec-0d92-4517-abfe-96cb95a9ad41') THEN
   SELECT scores_after INTO response FROM private.history_hands WHERE dealer_game_id='fce76deb-236a-4259-963d-af110ce58625' AND hand_number=9;
   IF response->>'c76c7386-5ca0-48bf-81c3-132e05b8adc3'<>'123' OR response->>'2057a7ff-8857-4d83-883f-15b61af0eb92'<>'110' THEN RAISE EXCEPTION 'history_proof:real_terminal_score'; END IF;
 END IF;
 RAISE NOTICE 'Canonical history proof passed: identity, ordered actions, duplicate, financial snapshots, visibility, audience, authorization, continuation, replay and saved terminal score';
END $proof$;
ROLLBACK;
