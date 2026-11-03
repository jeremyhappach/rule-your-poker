-- Revoke only marked qualification accounts, after canonical lifecycle cleanup.
BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='15s';
DO $$BEGIN
 IF EXISTS(SELECT FROM private.mega_test_accounts q JOIN auth.users u ON u.id=q.user_id WHERE u.raw_app_meta_data->>'mega_synthetic' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'unexpected test account';END IF;
 IF EXISTS(SELECT FROM public.games g JOIN private.mega_test_live q ON q.game_id=g.id WHERE g.real_money OR g.status<>'session_ended') THEN RAISE EXCEPTION 'unfinished synthetic live session';END IF;
 IF EXISTS(SELECT FROM private.delayed_matches m JOIN private.mega_test_async q ON q.match_id=m.id WHERE m.real_money OR m.status IN('active','invited')) THEN RAISE EXCEPTION 'unfinished synthetic async match';END IF;
END $$;
UPDATE private.mega_test_accounts SET expires_at=clock_timestamp();
UPDATE private.mega_test_live SET expires_at=clock_timestamp();
UPDATE private.mega_test_async SET expires_at=clock_timestamp();
UPDATE public.profiles SET is_active=false WHERE id IN(SELECT user_id FROM private.mega_test_accounts);
UPDATE auth.users SET banned_until='infinity'::timestamptz WHERE id IN(SELECT user_id FROM private.mega_test_accounts);
DELETE FROM auth.sessions WHERE user_id IN(SELECT user_id FROM private.mega_test_accounts);
-- Keep scopes to preserve outsider RLS isolation and keep canonical results/ledger audit.
COMMIT;
SELECT jsonb_build_object('active_test_accounts',(SELECT count(*) FROM public.profiles p JOIN private.mega_test_accounts q ON q.user_id=p.id WHERE p.is_active),'unexpired_test_accounts',(SELECT count(*) FROM private.mega_test_accounts WHERE expires_at>clock_timestamp()),'test_auth_sessions',(SELECT count(*) FROM auth.sessions WHERE user_id IN(SELECT user_id FROM private.mega_test_accounts))) evidence;
