-- Execute inside BEGIN / ROLLBACK. No persistent synthetic users or activity.
CREATE FUNCTION pg_temp.activity_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'recent_activity:%',label;END IF;END$$;
DO $$
DECLARE human_id uuid:=gen_random_uuid();bot_id uuid:=gen_random_uuid();admin_id uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(human_id);
 INSERT INTO public.profiles(id,username) VALUES(human_id,'Bot named human') ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username;
 INSERT INTO public.profiles(id,username) VALUES(bot_id,'Human named bot');
 UPDATE public.profiles SET last_seen_at=NULL WHERE id=human_id;
 SELECT r.user_id INTO admin_id FROM public.user_roles r JOIN auth.users a ON a.id=r.user_id WHERE r.role='admin' LIMIT 1;
 PERFORM pg_temp.activity_assert(admin_id IS NOT NULL,'existing admin required');
 PERFORM set_config('request.jwt.claim.sub',human_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',human_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  PERFORM public.admin_recent_activity();
  RAISE EXCEPTION 'missing admin authorization';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'activity:admin_required' THEN RAISE;END IF;
 END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 -- Exercise the real browser role and retained RPC grant, not just the SQL owner.
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM pg_temp.activity_assert(EXISTS(SELECT 1 FROM public.admin_recent_activity() WHERE id=human_id AND name='Bot named human' AND last_seen_at IS NULL),'registered human preserved regardless of name; Never preserved');
 PERFORM pg_temp.activity_assert(NOT EXISTS(SELECT 1 FROM public.admin_recent_activity() WHERE id=bot_id),'unregistered bot excluded without a retained seat');
 EXECUTE 'RESET ROLE';
 PERFORM pg_temp.activity_assert(
  (SELECT array_agg(id) FROM public.admin_recent_activity())=
  (SELECT array_agg(p.id ORDER BY p.last_seen_at DESC NULLS LAST,p.id) FROM public.profiles p JOIN auth.users a ON a.id=p.id),
  'all registered accounts only; newest first, Never last, deterministic ties');
 PERFORM pg_temp.activity_assert(NOT has_function_privilege('anon','public.admin_recent_activity()','EXECUTE'),'anonymous listing denied');
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN
  PERFORM public.admin_recent_activity();
  RAISE EXCEPTION 'missing unauthenticated authorization';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'activity:admin_required' THEN RAISE;END IF;
 END;
END$$;
SELECT 'registered-account identity, bot exclusion, ordering, Never and authorization passed' proof;
