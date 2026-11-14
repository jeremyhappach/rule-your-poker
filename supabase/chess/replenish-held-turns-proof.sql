-- Frozen incident inventory; rollback only. Do not replay after production replenishment.
BEGIN;
CREATE FUNCTION pg_temp.check_i(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'proof:%',label;END IF;END $f$;
SELECT set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
CREATE TEMP TABLE before_i AS SELECT 'live'::text scope,dealer_game_id id,to_jsonb(c) row FROM private.chess_matches c WHERE dealer_game_id='a29afbbb-4703-4cd3-8f7d-6dfda3c936c6'
 UNION ALL SELECT 'async',id,to_jsonb(c) FROM private.delayed_children c WHERE match_id IN('3b990ac7-af90-4eb4-a718-b98ccd871e85','68ba4c8a-aa3f-4f02-9721-f6e7dc6cd08e','c75914a4-aa6a-4bb8-a6d9-46ba45287805','86f00f02-35f8-4efa-9375-f31eed3539d1');
CREATE TEMP TABLE financial_i AS SELECT (SELECT count(*) FROM public.player_transactions) transactions,(SELECT count(*) FROM public.gameplay_transfer_batches) batches,(SELECT count(*) FROM private.delayed_current_outcomes) outcomes;
DO $p$
DECLARE targets jsonb:='[{"scope":"live","id":"a29afbbb-4703-4cd3-8f7d-6dfda3c936c6","gameId":"5671ce95-3d5b-41d9-b100-3c42f642c2cd","revision":24,"pauseVersion":1,"actor":"9e2e4c6d-c1ef-4035-9fb3-a4e1faf3c013"},{"scope":"async","id":"8664c23c-2f3f-4d13-9415-46a431e964be","revision":6,"actor":"ad62c2da-2956-4e82-857f-bc0eeef5e858","holdId":"2a4ddca5-0c9f-4ac2-a87d-b44fe9c52aa5"},{"scope":"async","id":"8a4353ad-e06e-4fec-8131-094043c2c95b","revision":123,"actor":"d7dc1928-3727-4351-b0ff-0e80c81c2953","holdId":"0c811612-597a-4b9b-be24-006b8555ce45"},{"scope":"async","id":"e5c6ddff-2129-49b7-9add-7183ec8816ca","revision":141,"actor":"d7dc1928-3727-4351-b0ff-0e80c81c2953","holdId":"8388c96a-680f-44ae-8f19-88730ef04585"},{"scope":"async","id":"20699f74-72a4-44eb-9202-14d1cc8201dd","revision":96,"actor":"ad62c2da-2956-4e82-857f-bc0eeef5e858","holdId":"8388c96a-680f-44ae-8f19-88730ef04585"},{"scope":"async","id":"b3eaa096-8c36-472d-9982-c13f21cb307a","revision":96,"actor":"ad62c2da-2956-4e82-857f-bc0eeef5e858","holdId":"8388c96a-680f-44ae-8f19-88730ef04585"},{"scope":"async","id":"38318206-7bd4-497d-8744-44af80c17a00","revision":56,"actor":"ad62c2da-2956-4e82-857f-bc0eeef5e858","holdId":"7836d47b-856f-4d72-953f-b236c303cf43"}]';request_i uuid:='9e951957-bdc2-43dd-a6d4-81d7d8b482ce';reason_i text:='Owner requested full active-turn timers before explicit resume; leave every hold open.';r jsonb;bad jsonb;e record;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','e13e2dd9-6b38-4073-a313-2286877af40c',true);
 BEGIN PERFORM public.admin_replenish_held_turns(request_i,targets,reason_i);RAISE EXCEPTION 'proof:unauthorized accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
 -- Live target sorts last: stale revision rolls back six prior candidate changes.
 bad:=jsonb_set(targets,'{0,revision}','-1');
 BEGIN PERFORM public.admin_replenish_held_turns(request_i,bad,reason_i);RAISE EXCEPTION 'proof:stale accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'clock_replenish:stale_or_unheld_live' THEN RAISE;END IF;END;
 PERFORM pg_temp.check_i(NOT EXISTS(SELECT FROM before_i b JOIN private.delayed_children c ON c.id=b.id WHERE b.scope='async' AND to_jsonb(c)<>b.row),'atomic stale batch rollback');
 PERFORM pg_temp.check_i(NOT EXISTS(SELECT FROM private.incident_clock_batches),'failed batch audit rollback');
 r:=public.admin_replenish_held_turns(request_i,targets,reason_i);
 PERFORM pg_temp.check_i(jsonb_array_length(r->'items')=7,'all seven turns');
 PERFORM pg_temp.check_i((public.admin_replenish_held_turns(request_i,targets,reason_i)->>'replayed')::boolean,'same request replay');
 BEGIN PERFORM public.admin_replenish_held_turns(request_i,targets,reason_i||'changed');RAISE EXCEPTION 'proof:changed payload accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'clock_replenish:request_conflict' THEN RAISE;END IF;END;
 BEGIN PERFORM public.admin_replenish_held_turns(gen_random_uuid(),targets,reason_i);RAISE EXCEPTION 'proof:duplicate paid';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT IN('clock_replenish:stale_or_unheld_async','clock_replenish:already_replenished') THEN RAISE;END IF;END;
 PERFORM pg_temp.check_i((SELECT count(*)=7 FROM private.incident_clock_entries),'exactly seven immutable entries');
 FOR e IN SELECT * FROM private.incident_clock_entries LOOP
  PERFORM pg_temp.check_i(((e.before_row->'state')-'deadline')=((e.after_row->'state')-'deadline'),'board banks history unchanged');
  IF e.scope='live' THEN
   PERFORM pg_temp.check_i((e.before_row-ARRAY['state','revision'])=(e.after_row-ARRAY['state','revision']),'live identity and hold unchanged');
  ELSE
   PERFORM pg_temp.check_i((e.before_row-ARRAY['state','revision','available_at','last_call_at','expires_at','gameplay_due_at'])=(e.after_row-ARRAY['state','revision','available_at','last_call_at','expires_at','gameplay_due_at']),'async remaining state unchanged');
  END IF;
 END LOOP;
 PERFORM pg_temp.check_i(NOT EXISTS(SELECT FROM before_i b JOIN private.delayed_children c ON c.id=b.id WHERE b.scope='async' AND (b.row->>'terminal')::boolean AND to_jsonb(c)<>b.row),'completed children unchanged');
 PERFORM pg_temp.check_i((SELECT is_paused FROM public.games WHERE id='5671ce95-3d5b-41d9-b100-3c42f642c2cd'),'live hold retained');
 PERFORM pg_temp.check_i(NOT EXISTS(SELECT FROM private.delayed_matches WHERE real_money AND status='active' AND NOT private.delayed_held(id)),'all async holds retained');
 -- Canonical resume proof remains inside this transaction and rolls back.
 r:=public.set_game_paused('5671ce95-3d5b-41d9-b100-3c42f642c2cd',false,'a29afbbb-4703-4cd3-8f7d-6dfda3c936c6',1);
 PERFORM pg_temp.check_i(r->>'outcome'='resumed','canonical live resume');
 PERFORM pg_temp.check_i((SELECT (state->>'deadline')::bigint-floor(extract(epoch FROM clock_timestamp())*1000) BETWEEN 299000 AND 300001 FROM private.chess_matches WHERE dealer_game_id='a29afbbb-4703-4cd3-8f7d-6dfda3c936c6'),'live full five minutes after resume');
 FOR e IN SELECT id FROM private.delayed_incidents WHERE closed_at IS NULL AND match_id IN('3b990ac7-af90-4eb4-a718-b98ccd871e85','68ba4c8a-aa3f-4f02-9721-f6e7dc6cd08e','c75914a4-aa6a-4bb8-a6d9-46ba45287805','86f00f02-35f8-4efa-9375-f31eed3539d1') LOOP
  PERFORM private.delayed_incident_close(e.id,'ROLLBACK ONLY resume proof, never persist');
 END LOOP;
 PERFORM pg_temp.check_i((SELECT (state->>'deadline')::bigint-floor(extract(epoch FROM clock_timestamp())*1000) BETWEEN 299000 AND 300001 FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b'),'async full five minutes after resume');
 PERFORM pg_temp.check_i(NOT EXISTS(SELECT FROM private.incident_clock_entries audit_row JOIN private.delayed_children c ON c.id=audit_row.target WHERE audit_row.scope='async' AND extract(epoch FROM(c.expires_at-clock_timestamp())) NOT BETWEEN 129599 AND 129601),'all waiting windows full after resume');
 PERFORM pg_temp.check_i((public.admin_replenish_held_turns(request_i,targets,reason_i)->>'replayed')::boolean,'late replay cannot reset running clocks');
 PERFORM pg_temp.check_i((SELECT transactions=(SELECT count(*) FROM public.player_transactions) AND batches=(SELECT count(*) FROM public.gameplay_transfer_batches) AND outcomes=(SELECT count(*) FROM private.delayed_current_outcomes) FROM financial_i),'zero settlement and finance writes');
END $p$;
SELECT 'PASS: authorization, seven targets, atomic rollback, replay, immutable history, holds, canonical resume and no finance changes' AS qualification;
ROLLBACK;
