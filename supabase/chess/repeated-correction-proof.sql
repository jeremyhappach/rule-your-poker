-- Run after the candidate migration in a BEGIN/ROLLBACK transaction.
CREATE FUNCTION pg_temp.assert_chess(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Chess proof: %',label;END IF;END $$;
CREATE TEMP TABLE chess_baseline AS SELECT
 (SELECT count(*) FROM public.player_transactions) txs,
 (SELECT count(*) FROM public.gameplay_transfer_batches) batches,
 (SELECT count(*) FROM public.games) games,
 (SELECT to_jsonb(c) FROM private.delayed_children c WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b') child,
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM private.delayed_corrections x) corrections;
SELECT set_config('request.jwt.claims','{}',true);
DO $$BEGIN
 BEGIN PERFORM public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 RAISE EXCEPTION 'missing_auth_guard';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d7dc1928-3727-4351-b0ff-0e80c81c2953"}',true);
DO $$BEGIN
 BEGIN PERFORM public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',126,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 RAISE EXCEPTION 'missing_revision_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:evidence_mismatch' THEN RAISE;END IF;END;
END $$;
SAVEPOINT fault;
CREATE FUNCTION pg_temp.reject_chess_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_after_reversals';END $$;
CREATE TRIGGER chess_fault BEFORE INSERT ON private.delayed_corrections FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_chess_audit();
DO $$BEGIN
 BEGIN PERFORM public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 RAISE EXCEPTION 'missing_fault';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'injected_after_reversals' THEN RAISE;END IF;END;
 PERFORM pg_temp.assert_chess((SELECT count(*) FROM public.player_transactions)=(SELECT txs FROM chess_baseline),'fault rolls account reversals back');
 PERFORM pg_temp.assert_chess((SELECT to_jsonb(c) FROM private.delayed_children c WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b')=(SELECT child FROM chess_baseline),'fault preserves terminal board');
 PERFORM pg_temp.assert_chess((SELECT chips=-2 FROM public.players WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e' AND user_id='d7dc1928-3727-4351-b0ff-0e80c81c2953'),'fault rolls chip reversal back');
END $$;
ROLLBACK TO fault;

SAVEPOINT scenario;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;s jsonb;v jsonb;receipt jsonb;again jsonb;
 original_request uuid:='a0eb52b4-6b3f-4b4d-bac9-7398b4bf301a';req uuid:=gen_random_uuid();n bigint;at_ms bigint;actor_i uuid;
BEGIN
 a:=public.admin_correct_chess_timeout(req,'8a4353ad-e06e-4fec-8131-094043c2c95b',127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.assert_chess(NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id),'restored active without hold');
 PERFORM pg_temp.assert_chess(c.state->>'opened'='false' AND c.started_at IS NULL AND c.gameplay_due_at IS NULL,'unopened has no five-minute clock');
 PERFORM pg_temp.assert_chess((c.state->>'deadline')::bigint-floor(extract(epoch FROM c.available_at)*1000)=129600000,'36-hour availability starts separately');
 PERFORM pg_temp.assert_chess(c.state->>'fen'=(SELECT child#>>'{state,fen}' FROM chess_baseline) AND c.state->'moves'=(SELECT child#>'{state,moves}' FROM chess_baseline) AND c.state->'turn'=(SELECT child#>'{state,turn}' FROM chess_baseline) AND c.state->'banks'=(SELECT child#>'{state,banks}' FROM chess_baseline),'board turn moves banks preserved');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_corrections WHERE child_id=c.id),'second audit appended');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'second loss reversed and balanced');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'canonical chips reversed');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'balanced inverse transfer receipts');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both superseded settlements preserved');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'current receipts reset');
 PERFORM pg_temp.assert_chess(public.delayed_home(m.id)->>'status'='active' AND public.delayed_home(m.id)->>'net'='0','home shows restored match');
 n:=(SELECT count(*) FROM public.player_transactions);
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=n,'duplicate reversal does not post twice');
 BEGIN PERFORM public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Changed correction fingerprint');
 RAISE EXCEPTION 'missing_request_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_reopened_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.assert_chess((SELECT NOT terminal AND started_at IS NULL FROM private.delayed_children WHERE id=c.id),'zero-client sync does not start turn');
 PERFORM pg_temp.assert_chess(NOT private.delayed_expire(c.id,60,to_timestamp(1794678423565/1000.0)),'old timeout cannot expire restored generation');
 v:=public.chess_commit('async',c.id,m.organizer,126,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":126}');
 PERFORM pg_temp.assert_chess(v->>'outcome'='stale','late action fenced');

 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 s:=c.state||jsonb_build_object('opened',true,'deadline',at_ms+300000);
 v:=public.chess_commit('async',c.id,m.organizer,c.revision,s,gen_random_uuid(),jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','open')));
 PERFORM pg_temp.assert_chess(v->>'outcome'='committed','opening commits');
 SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
 PERFORM pg_temp.assert_chess(c.started_at IS NOT NULL AND floor(extract(epoch FROM c.gameplay_due_at)*1000)=at_ms+300000,'five minutes begins on explicit opening');
 receipt:=private.delayed_record_outcome(c.id,c.revision,'normal',m.organizer,'{"proof":"generation two finish"}');
 PERFORM pg_temp.assert_chess(private.delayed_record_outcome(c.id,c.revision,'normal',m.organizer,'{"proof":"generation two finish"}')=receipt,'terminal replay');

 receipt:=private.delayed_finalize(m.id);
 PERFORM pg_temp.assert_chess(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=2,'settlement and replay');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=2 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,'8ef32074-a00a-48d9-b6f9-d4d066aeee0e',(receipt->>'game_id')::uuid)),'account net includes both reversals and new result');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND sum(chips)=0 AND max(abs(chips))=2 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new chips');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'only latest final review visible');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both reopened immutable receipts retained');
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND private.delayed_finalize(m.id)=receipt,'late correction replay preserves new result');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback hidden');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.assert_chess((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns runback');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_current_finale_seen WHERE match_id=m.id),'exactly two current finale acknowledgements');
 SET CONSTRAINTS ALL IMMEDIATE;
END $proof$;
ROLLBACK TO scenario;

SAVEPOINT scenario;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;s jsonb;v jsonb;receipt jsonb;again jsonb;
 original_request uuid:='a0eb52b4-6b3f-4b4d-bac9-7398b4bf301a';req uuid:=gen_random_uuid();n bigint;at_ms bigint;actor_i uuid;
BEGIN
 a:=public.admin_correct_chess_timeout(req,'8a4353ad-e06e-4fec-8131-094043c2c95b',127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.assert_chess(NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id),'restored active without hold');
 PERFORM pg_temp.assert_chess(c.state->>'opened'='false' AND c.started_at IS NULL AND c.gameplay_due_at IS NULL,'unopened has no five-minute clock');
 PERFORM pg_temp.assert_chess((c.state->>'deadline')::bigint-floor(extract(epoch FROM c.available_at)*1000)=129600000,'36-hour availability starts separately');
 PERFORM pg_temp.assert_chess(c.state->>'fen'=(SELECT child#>>'{state,fen}' FROM chess_baseline) AND c.state->'moves'=(SELECT child#>'{state,moves}' FROM chess_baseline) AND c.state->'turn'=(SELECT child#>'{state,turn}' FROM chess_baseline) AND c.state->'banks'=(SELECT child#>'{state,banks}' FROM chess_baseline),'board turn moves banks preserved');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_corrections WHERE child_id=c.id),'second audit appended');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'second loss reversed and balanced');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'canonical chips reversed');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'balanced inverse transfer receipts');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both superseded settlements preserved');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'current receipts reset');
 PERFORM pg_temp.assert_chess(public.delayed_home(m.id)->>'status'='active' AND public.delayed_home(m.id)->>'net'='0','home shows restored match');
 n:=(SELECT count(*) FROM public.player_transactions);
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=n,'duplicate reversal does not post twice');
 BEGIN PERFORM public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Changed correction fingerprint');
 RAISE EXCEPTION 'missing_request_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_reopened_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.assert_chess((SELECT NOT terminal AND started_at IS NULL FROM private.delayed_children WHERE id=c.id),'zero-client sync does not start turn');
 PERFORM pg_temp.assert_chess(NOT private.delayed_expire(c.id,60,to_timestamp(1794678423565/1000.0)),'old timeout cannot expire restored generation');
 v:=public.chess_commit('async',c.id,m.organizer,126,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":126}');
 PERFORM pg_temp.assert_chess(v->>'outcome'='stale','late action fenced');

 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 s:=c.state||jsonb_build_object('opened',true,'deadline',at_ms+300000);
 v:=public.chess_commit('async',c.id,m.organizer,c.revision,s,gen_random_uuid(),jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','open')));
 PERFORM pg_temp.assert_chess(v->>'outcome'='committed','opening commits');
 SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
 PERFORM pg_temp.assert_chess(c.started_at IS NOT NULL AND floor(extract(epoch FROM c.gameplay_due_at)*1000)=at_ms+300000,'five minutes begins on explicit opening');
 receipt:=private.delayed_record_outcome(c.id,c.revision,'normal',m.opponent,'{"proof":"generation two finish"}');
 PERFORM pg_temp.assert_chess(private.delayed_record_outcome(c.id,c.revision,'normal',m.opponent,'{"proof":"generation two finish"}')=receipt,'terminal replay');

 receipt:=private.delayed_finalize(m.id);
 PERFORM pg_temp.assert_chess(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=-2,'settlement and replay');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=-2 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,'8ef32074-a00a-48d9-b6f9-d4d066aeee0e',(receipt->>'game_id')::uuid)),'account net includes both reversals and new result');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND sum(chips)=0 AND max(abs(chips))=2 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new chips');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'only latest final review visible');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both reopened immutable receipts retained');
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND private.delayed_finalize(m.id)=receipt,'late correction replay preserves new result');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback hidden');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.assert_chess((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns runback');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_current_finale_seen WHERE match_id=m.id),'exactly two current finale acknowledgements');
 SET CONSTRAINTS ALL IMMEDIATE;
END $proof$;
ROLLBACK TO scenario;

SAVEPOINT scenario;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;s jsonb;v jsonb;receipt jsonb;again jsonb;
 original_request uuid:='a0eb52b4-6b3f-4b4d-bac9-7398b4bf301a';req uuid:=gen_random_uuid();n bigint;at_ms bigint;actor_i uuid;
BEGIN
 a:=public.admin_correct_chess_timeout(req,'8a4353ad-e06e-4fec-8131-094043c2c95b',127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.assert_chess(NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id),'restored active without hold');
 PERFORM pg_temp.assert_chess(c.state->>'opened'='false' AND c.started_at IS NULL AND c.gameplay_due_at IS NULL,'unopened has no five-minute clock');
 PERFORM pg_temp.assert_chess((c.state->>'deadline')::bigint-floor(extract(epoch FROM c.available_at)*1000)=129600000,'36-hour availability starts separately');
 PERFORM pg_temp.assert_chess(c.state->>'fen'=(SELECT child#>>'{state,fen}' FROM chess_baseline) AND c.state->'moves'=(SELECT child#>'{state,moves}' FROM chess_baseline) AND c.state->'turn'=(SELECT child#>'{state,turn}' FROM chess_baseline) AND c.state->'banks'=(SELECT child#>'{state,banks}' FROM chess_baseline),'board turn moves banks preserved');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_corrections WHERE child_id=c.id),'second audit appended');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'second loss reversed and balanced');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'canonical chips reversed');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'balanced inverse transfer receipts');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both superseded settlements preserved');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'current receipts reset');
 PERFORM pg_temp.assert_chess(public.delayed_home(m.id)->>'status'='active' AND public.delayed_home(m.id)->>'net'='0','home shows restored match');
 n:=(SELECT count(*) FROM public.player_transactions);
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=n,'duplicate reversal does not post twice');
 BEGIN PERFORM public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Changed correction fingerprint');
 RAISE EXCEPTION 'missing_request_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_reopened_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.assert_chess((SELECT NOT terminal AND started_at IS NULL FROM private.delayed_children WHERE id=c.id),'zero-client sync does not start turn');
 PERFORM pg_temp.assert_chess(NOT private.delayed_expire(c.id,60,to_timestamp(1794678423565/1000.0)),'old timeout cannot expire restored generation');
 v:=public.chess_commit('async',c.id,m.organizer,126,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":126}');
 PERFORM pg_temp.assert_chess(v->>'outcome'='stale','late action fenced');

 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 s:=c.state||jsonb_build_object('opened',true,'deadline',at_ms+300000);
 v:=public.chess_commit('async',c.id,m.organizer,c.revision,s,gen_random_uuid(),jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','open')));
 PERFORM pg_temp.assert_chess(v->>'outcome'='committed','opening commits');
 SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
 PERFORM pg_temp.assert_chess(c.started_at IS NOT NULL AND floor(extract(epoch FROM c.gameplay_due_at)*1000)=at_ms+300000,'five minutes begins on explicit opening');
 receipt:=private.delayed_record_outcome(c.id,c.revision,'draw',NULL,'{"proof":"generation two finish"}');
 PERFORM pg_temp.assert_chess(private.delayed_record_outcome(c.id,c.revision,'draw',NULL,'{"proof":"generation two finish"}')=receipt,'terminal replay');

 receipt:=private.delayed_finalize(m.id);
 PERFORM pg_temp.assert_chess(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=0,'settlement and replay');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=0 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,'8ef32074-a00a-48d9-b6f9-d4d066aeee0e',(receipt->>'game_id')::uuid)),'account net includes both reversals and new result');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND sum(chips)=0 AND max(abs(chips))=0 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new chips');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'only latest final review visible');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both reopened immutable receipts retained');
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND private.delayed_finalize(m.id)=receipt,'late correction replay preserves new result');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback hidden');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.assert_chess((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns runback');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_current_finale_seen WHERE match_id=m.id),'exactly two current finale acknowledgements');
 SET CONSTRAINTS ALL IMMEDIATE;
END $proof$;
ROLLBACK TO scenario;

SAVEPOINT scenario;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;s jsonb;v jsonb;receipt jsonb;again jsonb;
 original_request uuid:='a0eb52b4-6b3f-4b4d-bac9-7398b4bf301a';req uuid:=gen_random_uuid();n bigint;at_ms bigint;actor_i uuid;
BEGIN
 a:=public.admin_correct_chess_timeout(req,'8a4353ad-e06e-4fec-8131-094043c2c95b',127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.assert_chess(NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id),'restored active without hold');
 PERFORM pg_temp.assert_chess(c.state->>'opened'='false' AND c.started_at IS NULL AND c.gameplay_due_at IS NULL,'unopened has no five-minute clock');
 PERFORM pg_temp.assert_chess((c.state->>'deadline')::bigint-floor(extract(epoch FROM c.available_at)*1000)=129600000,'36-hour availability starts separately');
 PERFORM pg_temp.assert_chess(c.state->>'fen'=(SELECT child#>>'{state,fen}' FROM chess_baseline) AND c.state->'moves'=(SELECT child#>'{state,moves}' FROM chess_baseline) AND c.state->'turn'=(SELECT child#>'{state,turn}' FROM chess_baseline) AND c.state->'banks'=(SELECT child#>'{state,banks}' FROM chess_baseline),'board turn moves banks preserved');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_corrections WHERE child_id=c.id),'second audit appended');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'second loss reversed and balanced');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'canonical chips reversed');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'balanced inverse transfer receipts');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both superseded settlements preserved');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'current receipts reset');
 PERFORM pg_temp.assert_chess(public.delayed_home(m.id)->>'status'='active' AND public.delayed_home(m.id)->>'net'='0','home shows restored match');
 n:=(SELECT count(*) FROM public.player_transactions);
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=n,'duplicate reversal does not post twice');
 BEGIN PERFORM public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Changed correction fingerprint');
 RAISE EXCEPTION 'missing_request_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_reopened_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.assert_chess((SELECT NOT terminal AND started_at IS NULL FROM private.delayed_children WHERE id=c.id),'zero-client sync does not start turn');
 PERFORM pg_temp.assert_chess(NOT private.delayed_expire(c.id,60,to_timestamp(1794678423565/1000.0)),'old timeout cannot expire restored generation');
 v:=public.chess_commit('async',c.id,m.organizer,126,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":126}');
 PERFORM pg_temp.assert_chess(v->>'outcome'='stale','late action fenced');

 actor_i:=m.organizer;
 s:=c.state||jsonb_build_object('phase','complete','reason','resignation','winnerIds',jsonb_build_array(CASE WHEN actor_i=m.organizer THEN m.opponent ELSE m.organizer END),'scores',jsonb_build_object(m.organizer::text,0,m.opponent::text,1));
 -- Reject a forged winner even though the service is trusted.
 BEGIN PERFORM public.chess_commit('async',c.id,actor_i,c.revision,jsonb_set(s,'{winnerIds}',jsonb_build_array(actor_i)),gen_random_uuid(),jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','resign')));
 RAISE EXCEPTION 'missing_forfeit_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:invalid_forfeit' THEN RAISE;END IF;END;
 v:=public.chess_commit('async',c.id,actor_i,c.revision,s,req,jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','resign')));
 PERFORM pg_temp.assert_chess(v->>'outcome'='committed','either participant can forfeit unopened turn');
 PERFORM pg_temp.assert_chess(public.chess_commit('async',c.id,actor_i,c.revision,s,req,jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','resign')))->>'outcome'='duplicate','forfeit replay exactly once');

 receipt:=private.delayed_finalize(m.id);
 PERFORM pg_temp.assert_chess(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=-2,'settlement and replay');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=-2 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,'8ef32074-a00a-48d9-b6f9-d4d066aeee0e',(receipt->>'game_id')::uuid)),'account net includes both reversals and new result');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND sum(chips)=0 AND max(abs(chips))=2 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new chips');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'only latest final review visible');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both reopened immutable receipts retained');
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND private.delayed_finalize(m.id)=receipt,'late correction replay preserves new result');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback hidden');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.assert_chess((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns runback');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_current_finale_seen WHERE match_id=m.id),'exactly two current finale acknowledgements');
 SET CONSTRAINTS ALL IMMEDIATE;
END $proof$;
ROLLBACK TO scenario;

SAVEPOINT scenario;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;s jsonb;v jsonb;receipt jsonb;again jsonb;
 original_request uuid:='a0eb52b4-6b3f-4b4d-bac9-7398b4bf301a';req uuid:=gen_random_uuid();n bigint;at_ms bigint;actor_i uuid;
BEGIN
 a:=public.admin_correct_chess_timeout(req,'8a4353ad-e06e-4fec-8131-094043c2c95b',127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.assert_chess(NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id),'restored active without hold');
 PERFORM pg_temp.assert_chess(c.state->>'opened'='false' AND c.started_at IS NULL AND c.gameplay_due_at IS NULL,'unopened has no five-minute clock');
 PERFORM pg_temp.assert_chess((c.state->>'deadline')::bigint-floor(extract(epoch FROM c.available_at)*1000)=129600000,'36-hour availability starts separately');
 PERFORM pg_temp.assert_chess(c.state->>'fen'=(SELECT child#>>'{state,fen}' FROM chess_baseline) AND c.state->'moves'=(SELECT child#>'{state,moves}' FROM chess_baseline) AND c.state->'turn'=(SELECT child#>'{state,turn}' FROM chess_baseline) AND c.state->'banks'=(SELECT child#>'{state,banks}' FROM chess_baseline),'board turn moves banks preserved');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_corrections WHERE child_id=c.id),'second audit appended');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'second loss reversed and balanced');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'canonical chips reversed');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id='8ef32074-a00a-48d9-b6f9-d4d066aeee0e'),'balanced inverse transfer receipts');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both superseded settlements preserved');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'current receipts reset');
 PERFORM pg_temp.assert_chess(public.delayed_home(m.id)->>'status'='active' AND public.delayed_home(m.id)->>'net'='0','home shows restored match');
 n:=(SELECT count(*) FROM public.player_transactions);
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=n,'duplicate reversal does not post twice');
 BEGIN PERFORM public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Changed correction fingerprint');
 RAISE EXCEPTION 'missing_request_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_reopened_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.assert_chess((SELECT NOT terminal AND started_at IS NULL FROM private.delayed_children WHERE id=c.id),'zero-client sync does not start turn');
 PERFORM pg_temp.assert_chess(NOT private.delayed_expire(c.id,60,to_timestamp(1794678423565/1000.0)),'old timeout cannot expire restored generation');
 v:=public.chess_commit('async',c.id,m.organizer,126,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":126}');
 PERFORM pg_temp.assert_chess(v->>'outcome'='stale','late action fenced');

 actor_i:=m.opponent;
 s:=c.state||jsonb_build_object('phase','complete','reason','resignation','winnerIds',jsonb_build_array(CASE WHEN actor_i=m.organizer THEN m.opponent ELSE m.organizer END),'scores',jsonb_build_object(m.organizer::text,1,m.opponent::text,0));
 -- Reject a forged winner even though the service is trusted.
 BEGIN PERFORM public.chess_commit('async',c.id,actor_i,c.revision,jsonb_set(s,'{winnerIds}',jsonb_build_array(actor_i)),gen_random_uuid(),jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','resign')));
 RAISE EXCEPTION 'missing_forfeit_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:invalid_forfeit' THEN RAISE;END IF;END;
 v:=public.chess_commit('async',c.id,actor_i,c.revision,s,req,jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','resign')));
 PERFORM pg_temp.assert_chess(v->>'outcome'='committed','either participant can forfeit unopened turn');
 PERFORM pg_temp.assert_chess(public.chess_commit('async',c.id,actor_i,c.revision,s,req,jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','resign')))->>'outcome'='duplicate','forfeit replay exactly once');

 receipt:=private.delayed_finalize(m.id);
 PERFORM pg_temp.assert_chess(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=2,'settlement and replay');
 PERFORM pg_temp.assert_chess((SELECT sum(amount)=2 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,'8ef32074-a00a-48d9-b6f9-d4d066aeee0e',(receipt->>'game_id')::uuid)),'account net includes both reversals and new result');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND sum(chips)=0 AND max(abs(chips))=2 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new chips');
 PERFORM pg_temp.assert_chess((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'only latest final review visible');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_reopened_settlements WHERE match_id=m.id),'both reopened immutable receipts retained');
 again:=public.admin_correct_chess_timeout(req,c.id,127,'06824ba57919d000181ff0a1e02a87ea','Rollback second correction proof');
 PERFORM pg_temp.assert_chess(again->>'outcome'='already_corrected' AND private.delayed_finalize(m.id)=receipt,'late correction replay preserves new result');
 PERFORM pg_temp.assert_chess(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback hidden');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.assert_chess((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns runback');
 PERFORM pg_temp.assert_chess((SELECT count(*)=2 FROM private.delayed_current_finale_seen WHERE match_id=m.id),'exactly two current finale acknowledgements');
 SET CONSTRAINTS ALL IMMEDIATE;
END $proof$;
ROLLBACK TO scenario;

SELECT pg_temp.assert_chess((SELECT txs=(SELECT count(*) FROM public.player_transactions) AND batches=(SELECT count(*) FROM public.gameplay_transfer_batches) AND games=(SELECT count(*) FROM public.games) AND child=(SELECT to_jsonb(c) FROM private.delayed_children c WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b') AND corrections=(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM private.delayed_corrections x) FROM chess_baseline),'all proof mutations rolled back');
SELECT 'PASS: second reversal, fault atomicity, unopened clock, five-minute opening, both forfeit actors, winner/loser/tie, duplicate and late replay, terminal reviews, finale/runback, immutable history and canonical finances' result;
