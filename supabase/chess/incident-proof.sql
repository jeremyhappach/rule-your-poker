
CREATE FUNCTION pg_temp.incident_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'incident proof: %',label;END IF;END $$;
SELECT pg_temp.incident_assert((SELECT is_paused FROM public.games WHERE id='5671ce95-3d5b-41d9-b100-3c42f642c2cd'),'live remains paused at proof entry');
CREATE TEMP TABLE incident_baseline AS SELECT
 (SELECT count(*) FROM public.player_transactions) txs,
 (SELECT count(*) FROM public.gameplay_transfer_batches) batches,
 (SELECT count(*) FROM public.games) games,
 (SELECT md5(to_jsonb(c)::text) FROM private.delayed_children c WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b') child_hash;
SELECT set_config('request.jwt.claims','{}',true);
DO $$BEGIN
 BEGIN PERFORM public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 RAISE EXCEPTION 'proof_missing_auth_guard';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d7dc1928-3727-4351-b0ff-0e80c81c2953"}',true);
DO $$BEGIN
 BEGIN PERFORM public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',119,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 RAISE EXCEPTION 'proof_missing_revision_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:evidence_mismatch' THEN RAISE;END IF;END;
END $$;

SAVEPOINT atomic_fault;
CREATE FUNCTION pg_temp.reject_correction_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_after_reversals';END $$;
CREATE TRIGGER incident_fault BEFORE INSERT ON private.delayed_corrections FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_correction_audit();
DO $$BEGIN
 BEGIN PERFORM public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback atomicity proof');
 RAISE EXCEPTION 'missing_injected_failure';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'injected_after_reversals' THEN RAISE;END IF;END;
 PERFORM pg_temp.incident_assert((SELECT count(*)=2 AND sum(amount)=0 FROM public.player_transactions WHERE source_game_id='68ba4c8a-aa3f-4f02-9721-f6e7dc6cd08e'),'failure rolls account reversals back');
 PERFORM pg_temp.incident_assert((SELECT chips=-2 FROM public.players WHERE game_id='68ba4c8a-aa3f-4f02-9721-f6e7dc6cd08e' AND user_id='d7dc1928-3727-4351-b0ff-0e80c81c2953'),'failure rolls canonical chips back');
 PERFORM pg_temp.incident_assert((SELECT terminal AND revision=120 FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b'),'failure leaves original terminal state');
END $$;
ROLLBACK TO atomic_fault;

SAVEPOINT scenario;
CREATE TEMP TABLE correction_answer AS SELECT public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof') value;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;again jsonb;receipt jsonb;before_receipt jsonb;old_count int;nonce uuid;
BEGIN
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 SELECT value INTO a FROM correction_answer;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.incident_assert(NOT c.terminal AND m.status='active' AND private.delayed_held(m.id),'reopened but held');
 PERFORM pg_temp.incident_assert(c.actor=m.organizer AND c.state->>'turn'='59' AND c.state->>'fen'='5k2/1pN1n1pp/4Q3/rpb2P2/2p5/2P1P1P1/2q4P/3r1RK1 w - - 3 30','exact turn and committed board');
 PERFORM pg_temp.incident_assert((c.state->>'deadline')::bigint-(SELECT floor(extract(epoch FROM opened_at)*1000) FROM private.delayed_incidents WHERE id=(a->>'holdId')::uuid)=300000,'fresh full five minutes held');
 PERFORM pg_temp.incident_assert(c.state->'banks'=jsonb_build_object(m.organizer::text,'[]'::jsonb,m.opponent::text,'[]'::jsonb),'banks before affected turn');
 PERFORM pg_temp.incident_assert((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id=m.id),'balanced account reversals');
 PERFORM pg_temp.incident_assert((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id=m.id),'canonical chip reversal');
 PERFORM pg_temp.incident_assert((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id=m.id),'both balanced canonical transfer receipts');
 PERFORM pg_temp.incident_assert((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_settlements WHERE match_id=m.id),'original immutable records retained');
 PERFORM pg_temp.incident_assert(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'superseded results excluded from current state');
 PERFORM pg_temp.incident_assert((public.delayed_home(m.id)->>'net')::int=0 AND public.delayed_home(m.id)->>'status'='active','lobby current projection');
 SELECT count(*) INTO old_count FROM public.player_transactions;
 again:=public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 PERFORM pg_temp.incident_assert(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=old_count,'duplicate correction is exactly once');
 BEGIN PERFORM public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','different reason is forbidden');
 RAISE EXCEPTION 'proof_missing_payload_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'proof_mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.incident_assert((SELECT NOT terminal FROM private.delayed_children WHERE id=c.id),'held zero-client worker cannot expire turn');
 PERFORM private.delayed_incident_close((a->>'holdId')::uuid,'Rollback-only explicit resume verification');
 SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
 PERFORM pg_temp.incident_assert((c.state->>'deadline')::bigint-floor(extract(epoch FROM clock_timestamp())*1000) BETWEEN 299000 AND 300000,'release retains full five-minute turn');
 PERFORM pg_temp.incident_assert(NOT private.delayed_expire(c.id,59,to_timestamp(1794628287225/1000.0)),'old timeout replay cannot end restored turn');
 receipt:=public.chess_commit('async',c.id,m.organizer,118,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":118}');
 PERFORM pg_temp.incident_assert(receipt->>'outcome'='stale','late prior-generation action fenced');
 receipt:=private.delayed_record_outcome(c.id,c.revision,'normal',m.organizer,'{"proof":"corrected finish"}');
 PERFORM pg_temp.incident_assert(private.delayed_record_outcome(c.id,c.revision,'normal',m.organizer,'{"proof":"corrected finish"}')=receipt,'new terminal outcome replay');
 receipt:=private.delayed_finalize(m.id);before_receipt:=receipt;
 PERFORM pg_temp.incident_assert(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=2,'corrected settlement replay');
 PERFORM pg_temp.incident_assert((SELECT sum(amount)=2 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,(receipt->>'game_id')::uuid)),'net account result after reversal plus new settlement');
 PERFORM pg_temp.incident_assert((SELECT sum(chips)=0 AND count(*)=2 AND max(abs(chips))=2 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new settlement chips');
 PERFORM pg_temp.incident_assert((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'one current final review preserves original history');
 again:=public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 PERFORM pg_temp.incident_assert(private.delayed_finalize(m.id)=before_receipt AND again->>'outcome'='already_corrected','late correction replay cannot undo continuation');

 PERFORM pg_temp.incident_assert(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback receipt is not current');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.incident_assert((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns corrected runback');
 PERFORM pg_temp.incident_assert((SELECT viewer=m.opponent FROM private.delayed_runback_viewers WHERE match_id=m.id),'original runback audit is preserved');

 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
END $proof$;
ROLLBACK TO scenario;

SAVEPOINT scenario;
CREATE TEMP TABLE correction_answer AS SELECT public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof') value;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;again jsonb;receipt jsonb;before_receipt jsonb;old_count int;nonce uuid;
BEGIN
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 SELECT value INTO a FROM correction_answer;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.incident_assert(NOT c.terminal AND m.status='active' AND private.delayed_held(m.id),'reopened but held');
 PERFORM pg_temp.incident_assert(c.actor=m.organizer AND c.state->>'turn'='59' AND c.state->>'fen'='5k2/1pN1n1pp/4Q3/rpb2P2/2p5/2P1P1P1/2q4P/3r1RK1 w - - 3 30','exact turn and committed board');
 PERFORM pg_temp.incident_assert((c.state->>'deadline')::bigint-(SELECT floor(extract(epoch FROM opened_at)*1000) FROM private.delayed_incidents WHERE id=(a->>'holdId')::uuid)=300000,'fresh full five minutes held');
 PERFORM pg_temp.incident_assert(c.state->'banks'=jsonb_build_object(m.organizer::text,'[]'::jsonb,m.opponent::text,'[]'::jsonb),'banks before affected turn');
 PERFORM pg_temp.incident_assert((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id=m.id),'balanced account reversals');
 PERFORM pg_temp.incident_assert((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id=m.id),'canonical chip reversal');
 PERFORM pg_temp.incident_assert((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id=m.id),'both balanced canonical transfer receipts');
 PERFORM pg_temp.incident_assert((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_settlements WHERE match_id=m.id),'original immutable records retained');
 PERFORM pg_temp.incident_assert(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'superseded results excluded from current state');
 PERFORM pg_temp.incident_assert((public.delayed_home(m.id)->>'net')::int=0 AND public.delayed_home(m.id)->>'status'='active','lobby current projection');
 SELECT count(*) INTO old_count FROM public.player_transactions;
 again:=public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 PERFORM pg_temp.incident_assert(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=old_count,'duplicate correction is exactly once');
 BEGIN PERFORM public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','different reason is forbidden');
 RAISE EXCEPTION 'proof_missing_payload_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'proof_mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.incident_assert((SELECT NOT terminal FROM private.delayed_children WHERE id=c.id),'held zero-client worker cannot expire turn');
 PERFORM private.delayed_incident_close((a->>'holdId')::uuid,'Rollback-only explicit resume verification');
 SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
 PERFORM pg_temp.incident_assert((c.state->>'deadline')::bigint-floor(extract(epoch FROM clock_timestamp())*1000) BETWEEN 299000 AND 300000,'release retains full five-minute turn');
 PERFORM pg_temp.incident_assert(NOT private.delayed_expire(c.id,59,to_timestamp(1794628287225/1000.0)),'old timeout replay cannot end restored turn');
 receipt:=public.chess_commit('async',c.id,m.organizer,118,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":118}');
 PERFORM pg_temp.incident_assert(receipt->>'outcome'='stale','late prior-generation action fenced');
 receipt:=private.delayed_record_outcome(c.id,c.revision,'normal',m.opponent,'{"proof":"corrected finish"}');
 PERFORM pg_temp.incident_assert(private.delayed_record_outcome(c.id,c.revision,'normal',m.opponent,'{"proof":"corrected finish"}')=receipt,'new terminal outcome replay');
 receipt:=private.delayed_finalize(m.id);before_receipt:=receipt;
 PERFORM pg_temp.incident_assert(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=-2,'corrected settlement replay');
 PERFORM pg_temp.incident_assert((SELECT sum(amount)=-2 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,(receipt->>'game_id')::uuid)),'net account result after reversal plus new settlement');
 PERFORM pg_temp.incident_assert((SELECT sum(chips)=0 AND count(*)=2 AND max(abs(chips))=2 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new settlement chips');
 PERFORM pg_temp.incident_assert((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'one current final review preserves original history');
 again:=public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 PERFORM pg_temp.incident_assert(private.delayed_finalize(m.id)=before_receipt AND again->>'outcome'='already_corrected','late correction replay cannot undo continuation');

 PERFORM pg_temp.incident_assert(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback receipt is not current');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.incident_assert((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns corrected runback');
 PERFORM pg_temp.incident_assert((SELECT viewer=m.opponent FROM private.delayed_runback_viewers WHERE match_id=m.id),'original runback audit is preserved');

 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
END $proof$;
ROLLBACK TO scenario;

SAVEPOINT scenario;
CREATE TEMP TABLE correction_answer AS SELECT public.admin_correct_chess_timeout(gen_random_uuid(),'8a4353ad-e06e-4fec-8131-094043c2c95b',120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof') value;
DO $proof$
DECLARE a jsonb;c private.delayed_children;m private.delayed_matches;again jsonb;receipt jsonb;before_receipt jsonb;old_count int;nonce uuid;
BEGIN
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 SELECT value INTO a FROM correction_answer;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b';
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 PERFORM pg_temp.incident_assert(NOT c.terminal AND m.status='active' AND private.delayed_held(m.id),'reopened but held');
 PERFORM pg_temp.incident_assert(c.actor=m.organizer AND c.state->>'turn'='59' AND c.state->>'fen'='5k2/1pN1n1pp/4Q3/rpb2P2/2p5/2P1P1P1/2q4P/3r1RK1 w - - 3 30','exact turn and committed board');
 PERFORM pg_temp.incident_assert((c.state->>'deadline')::bigint-(SELECT floor(extract(epoch FROM opened_at)*1000) FROM private.delayed_incidents WHERE id=(a->>'holdId')::uuid)=300000,'fresh full five minutes held');
 PERFORM pg_temp.incident_assert(c.state->'banks'=jsonb_build_object(m.organizer::text,'[]'::jsonb,m.opponent::text,'[]'::jsonb),'banks before affected turn');
 PERFORM pg_temp.incident_assert((SELECT sum(amount)=0 AND count(*)=4 FROM public.player_transactions WHERE source_game_id=m.id),'balanced account reversals');
 PERFORM pg_temp.incident_assert((SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id=m.id),'canonical chip reversal');
 PERFORM pg_temp.incident_assert((SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id=m.id),'both balanced canonical transfer receipts');
 PERFORM pg_temp.incident_assert((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id) AND (SELECT count(*)=1 FROM private.delayed_settlements WHERE match_id=m.id),'original immutable records retained');
 PERFORM pg_temp.incident_assert(NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id),'superseded results excluded from current state');
 PERFORM pg_temp.incident_assert((public.delayed_home(m.id)->>'net')::int=0 AND public.delayed_home(m.id)->>'status'='active','lobby current projection');
 SELECT count(*) INTO old_count FROM public.player_transactions;
 again:=public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 PERFORM pg_temp.incident_assert(again->>'outcome'='already_corrected' AND (SELECT count(*) FROM public.player_transactions)=old_count,'duplicate correction is exactly once');
 BEGIN PERFORM public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','different reason is forbidden');
 RAISE EXCEPTION 'proof_missing_payload_guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_correction:request_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.delayed_outcomes SET evidence='{}' WHERE child_id=c.id;
 RAISE EXCEPTION 'proof_mutable_original';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.incident_assert((SELECT NOT terminal FROM private.delayed_children WHERE id=c.id),'held zero-client worker cannot expire turn');
 PERFORM private.delayed_incident_close((a->>'holdId')::uuid,'Rollback-only explicit resume verification');
 SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
 PERFORM pg_temp.incident_assert((c.state->>'deadline')::bigint-floor(extract(epoch FROM clock_timestamp())*1000) BETWEEN 299000 AND 300000,'release retains full five-minute turn');
 PERFORM pg_temp.incident_assert(NOT private.delayed_expire(c.id,59,to_timestamp(1794628287225/1000.0)),'old timeout replay cannot end restored turn');
 receipt:=public.chess_commit('async',c.id,m.organizer,118,c.state,gen_random_uuid(),'{"intent":{"type":"move"},"revision":118}');
 PERFORM pg_temp.incident_assert(receipt->>'outcome'='stale','late prior-generation action fenced');
 receipt:=private.delayed_record_outcome(c.id,c.revision,'draw',NULL,'{"proof":"corrected finish"}');
 PERFORM pg_temp.incident_assert(private.delayed_record_outcome(c.id,c.revision,'draw',NULL,'{"proof":"corrected finish"}')=receipt,'new terminal outcome replay');
 receipt:=private.delayed_finalize(m.id);before_receipt:=receipt;
 PERFORM pg_temp.incident_assert(receipt=private.delayed_finalize(m.id) AND (receipt->>'organizer_delta')::int=0,'corrected settlement replay');
 PERFORM pg_temp.incident_assert((SELECT sum(amount)=0 FROM public.player_transactions WHERE profile_id=m.organizer AND source_game_id IN(m.id,(receipt->>'game_id')::uuid)),'net account result after reversal plus new settlement');
 PERFORM pg_temp.incident_assert((SELECT sum(chips)=0 AND count(*)=2 AND max(abs(chips))=0 FROM public.players WHERE game_id=(receipt->>'game_id')::uuid),'canonical new settlement chips');
 PERFORM pg_temp.incident_assert((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'one current final review preserves original history');
 again:=public.admin_correct_chess_timeout((a->>'id')::uuid,c.id,120,'2e6a0beb308bc8f88b37d0bb141f1002','Rollback correction proof');
 PERFORM pg_temp.incident_assert(private.delayed_finalize(m.id)=before_receipt AND again->>'outcome'='already_corrected','late correction replay cannot undo continuation');

 PERFORM pg_temp.incident_assert(NOT EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'old runback receipt is not current');
 INSERT INTO private.delayed_review_seen(event_id,viewer) SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.opponent)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',m.organizer)::text,true);
 PERFORM public.delayed_finale_ack(m.id);
 PERFORM pg_temp.incident_assert((SELECT viewer=m.organizer FROM private.delayed_current_runback_viewers WHERE match_id=m.id),'new second reviewer owns corrected runback');
 PERFORM pg_temp.incident_assert((SELECT viewer=m.opponent FROM private.delayed_runback_viewers WHERE match_id=m.id),'original runback audit is preserved');

 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
END $proof$;
ROLLBACK TO scenario;

SAVEPOINT pause_proof;
DO $p$
DECLARE v jsonb;g public.games;before_s jsonb;req uuid:=gen_random_uuid();r jsonb;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id='5671ce95-3d5b-41d9-b100-3c42f642c2cd';
 SELECT state INTO before_s FROM private.chess_matches WHERE dealer_game_id=g.current_game_uuid;
 r:=public.set_game_paused(g.id,false,g.current_game_uuid,g.pause_version);
 PERFORM pg_temp.incident_assert(r->>'outcome'='resumed','host can resume');
 v:=private.chess_record('live',g.current_game_uuid,'e13e2dd9-6b38-4073-a313-2286877af40c');
 v:=public.chess_request_pause(g.current_game_uuid,'e13e2dd9-6b38-4073-a313-2286877af40c',req,(v->>'revision')::bigint,'{"type":"request_pause"}');
 PERFORM pg_temp.incident_assert(v#>>'{state,pauseRequest,id}'=req::text AND v->>'paused'='false','guest requests without changing pause');
 PERFORM pg_temp.incident_assert(v#>'{state,banks}'=before_s->'banks' AND v#>'{state,fen}'=before_s->'fen','request preserves board and banks');
 PERFORM set_config('request.jwt.claims','{"role":"authenticated","sub":"e13e2dd9-6b38-4073-a313-2286877af40c"}',true);
 SELECT * INTO g FROM public.games WHERE id=g.id;
 r:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
 PERFORM pg_temp.incident_assert(r->>'outcome'='not_authorized','non-host cannot pause directly');
 PERFORM set_config('request.jwt.claims','{"role":"authenticated","sub":"d7dc1928-3727-4351-b0ff-0e80c81c2953"}',true);
 r:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
 PERFORM pg_temp.incident_assert(r->>'outcome'='paused','host can pause');
 v:=private.chess_record('live',g.current_game_uuid,g.current_host);
 PERFORM pg_temp.incident_assert(v->>'paused'='true' AND NOT (v->'state'?'pauseRequest'),'canonical pause clears request');
 PERFORM pg_temp.incident_assert(v#>'{state,banks}'=before_s->'banks','pause preserves banks');
END $p$;
ROLLBACK TO pause_proof;
SELECT pg_temp.incident_assert((SELECT txs=(SELECT count(*) FROM public.player_transactions) AND games=(SELECT count(*) FROM public.games) AND batches=(SELECT count(*) FROM public.gameplay_transfer_batches) AND child_hash=(SELECT md5(to_jsonb(c)::text) FROM private.delayed_children c WHERE id='8a4353ad-e06e-4fec-8131-094043c2c95b') FROM incident_baseline),'all scenario writes rolled back');
SELECT 'PASS: winner, loser, tie, duplicate, late replay, authorization, continuation, clocks, banks, original audits and canonical ledgers; all holds preserved' result;
