-- Read-only assertions immediately after closed installation, before worker enablement.
DO $$
BEGIN
 IF (SELECT count(*) FROM private.canasta_release WHERE NOT enabled AND NOT admission_enabled)<>1 THEN RAISE EXCEPTION 'canasta:release_not_closed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='canasta' AND ante_amount>0) THEN RAISE EXCEPTION 'canasta:stake_default_missing';END IF;
 IF (SELECT count(*) FROM cron.job WHERE jobname='canasta-recovery' AND NOT active AND schedule='5 seconds'
  AND command='SELECT private.canasta_dispatch_recovery()')<>1 THEN RAISE EXCEPTION 'canasta:scheduler_not_closed';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='canasta_revisions') THEN RAISE EXCEPTION 'canasta:publication_missing';END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.canasta_revisions'::regclass) THEN RAISE EXCEPTION 'canasta:rls_missing';END IF;
 IF has_function_privilege('authenticated','public.canasta_server_commit(uuid,bigint,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.canasta_configure(uuid,uuid,integer,text,jsonb,timestamptz)','EXECUTE')
 OR has_function_privilege('authenticated','private.canasta_begin(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.canasta_server_commit(uuid,bigint,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'canasta:authority_grants';END IF;
 IF position('canasta:fake_money_only' IN pg_get_functiondef('public.canasta_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure))=0
 OR position('canasta:fake_money_only' IN pg_get_functiondef('private.canasta_begin(uuid,uuid)'::regprocedure))=0 THEN RAISE EXCEPTION 'canasta:money_guard_missing';END IF;
END $$;
SELECT enabled,admission_enabled FROM private.canasta_release;
SELECT jobname,schedule,active FROM cron.job WHERE jobname='canasta-recovery';
