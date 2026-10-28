SET LOCAL lock_timeout='2s';
DO $$ DECLARE before_hash text;after_hash text;BEGIN
IF (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM '77ae80ad46793e7d80ae6eb89df6c776af85cf1c' THEN RAISE EXCEPTION 'mega:release_drift';END IF;
IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE (version,name) IN(('20261023141036','mega_card_golf_v1'),('20261023150632','mega_card_golf_low_score_facts'),('20261023151456','mega_card_golf_qualification_cleanup')))<>3 THEN RAISE EXCEPTION 'mega:migrations';END IF;
IF (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='private.arcade_results'::regclass AND tgname='arcade_score_facts') IS DISTINCT FROM 'CREATE TRIGGER arcade_score_facts BEFORE INSERT ON private.arcade_results FOR EACH ROW WHEN ((new.game <> ''mega-card-golf''::text)) EXECUTE FUNCTION private.arcade_score_facts()' THEN RAISE EXCEPTION 'mega:score_facts';END IF;
IF (SELECT tgenabled FROM pg_trigger WHERE tgrelid='private.arcade_results'::regclass AND tgname='arcade_result_immutable') IS DISTINCT FROM 'O' THEN RAISE EXCEPTION 'mega:immutable';END IF;
IF EXISTS(SELECT 1 FROM private.arcade_runs WHERE game='mega-card-golf') OR EXISTS(SELECT 1 FROM private.arcade_results WHERE game='mega-card-golf') THEN RAISE EXCEPTION 'mega:fixture_cleanup';END IF;
IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'mega:recovery_unhealthy';END IF;
IF (SELECT count(*) FROM private.arcade_mega_courses p JOIN private.arcade_mega_configs c ON c.id=p.config_id JOIN (VALUES('sunny-meadows',16,5),('coastal-links',12,3),('devils-canyon',8,1)) e(id,stock,discards) ON p.id=e.id WHERE c.revision=1 AND c.settings@>jsonb_build_object('enabled',true,'holes',9,'initialExposed',2,'completionSeconds',300,'stockAllowance',e.stock,'discardAllowance',e.discards))<>3 THEN RAISE EXCEPTION 'mega:course_drift';END IF;
SELECT md5(string_agg(to_jsonb(r)::text,'|' ORDER BY id)) INTO before_hash FROM private.arcade_rulesets r WHERE id<>'mega-card-golf/1';
UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/1' AND enabled=false;
IF NOT FOUND THEN RAISE EXCEPTION 'mega:admission_drift';END IF;
SELECT md5(string_agg(to_jsonb(r)::text,'|' ORDER BY id)) INTO after_hash FROM private.arcade_rulesets r WHERE id<>'mega-card-golf/1';
IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'mega:other_game_flags';END IF;
END $$;
SELECT jsonb_build_object('activated_at',clock_timestamp(),'rule',(SELECT to_jsonb(r) FROM private.arcade_rulesets r WHERE id='mega-card-golf/1'),'courses',public.arcade_mega_catalog('d7dc1928-3727-4351-b0ff-0e80c81c2953')->'courses','other_rule_flags_preserved',true,'release',(SELECT value FROM public.system_settings WHERE key='release_publication')) AS evidence;
