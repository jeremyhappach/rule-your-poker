-- Read-only inventory; no function below advances gameplay or recovery.
SELECT jsonb_build_object(
 'observed_at',clock_timestamp(),
 'wal_level',current_setting('wal_level'),
 'pg_cron_version',(SELECT extversion FROM pg_extension WHERE extname='pg_cron'),
 'cron_schedule_available',to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL,
 'realtime_publication',EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime'),
 'scheduler',(SELECT jsonb_agg(jsonb_build_object('last_completed_at',last_completed_at,'last_outcome',last_outcome,'age_seconds',extract(epoch FROM clock_timestamp()-last_completed_at))) FROM private.game_recovery_dispatch_state),
 'golf_release',to_regclass('private.golf_release')::text,
 'golf_sessions',(SELECT count(*) FROM public.games WHERE game_type='six-card-golf'),
 'golf_results',(SELECT count(*) FROM public.game_results WHERE game_type='six-card-golf'),
 'active_account_count',(SELECT count(*) FROM public.profiles WHERE is_active),
 'migration_history',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name)) FROM supabase_migrations.schema_migrations WHERE name ILIKE '%golf%' OR name ILIKE '%race_poker%'),
 'browser_private_schema_usage',jsonb_build_object('anon',has_schema_privilege('anon','private','USAGE'),'authenticated',has_schema_privilege('authenticated','private','USAGE'))
) preflight;
