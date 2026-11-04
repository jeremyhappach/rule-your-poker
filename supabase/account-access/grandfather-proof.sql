-- Run inside BEGIN/ROLLBACK, after the candidate or installed migration.
DO $proof$
DECLARE cohort_user record; s jsonb; admin_i uuid; fixture uuid:=gen_random_uuid();
 fixture_email text; cohort_count integer:=0;
BEGIN
 FOR cohort_user IN SELECT id,email FROM auth.users
  WHERE created_at <= timestamptz '2026-11-04 17:03:38.712215+00'
   AND deleted_at IS NULL AND nullif(email,'') IS NOT NULL
 LOOP
  PERFORM set_config('request.jwt.claim.sub',cohort_user.id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',cohort_user.id,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  s:=public.account_access_snapshot();
  RESET ROLE;
  IF s->>'userId' IS DISTINCT FROM cohort_user.id::text OR s->>'verified' IS DISTINCT FROM 'true'
   THEN RAISE EXCEPTION 'existing user not verified through authenticated snapshot'; END IF;
  cohort_count:=cohort_count+1;
 END LOOP;
 IF cohort_count<>17 THEN RAISE EXCEPTION 'unexpected current-user cohort: %',cohort_count; END IF;
 SELECT a.user_id INTO STRICT admin_i FROM public.account_access a
  JOIN public.user_roles r ON r.user_id=a.user_id
  WHERE a.enabled AND r.role='admin' ORDER BY a.user_id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',admin_i::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_i,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 s:=public.admin_account_directory();
 RESET ROLE;
 IF (SELECT count(*) FROM jsonb_array_elements(s) x
  JOIN auth.users u ON u.id=(x->>'id')::uuid
  WHERE u.created_at<=timestamptz '2026-11-04 17:03:38.712215+00'
   AND x->>'verified'='true')<>17 THEN RAISE EXCEPTION 'admin directory not verified'; END IF;

 fixture_email:='grandfather-proof-'||fixture||'@example.invalid';
 INSERT INTO auth.users(id,email,created_at) VALUES(fixture,fixture_email,clock_timestamp());
 PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 s:=public.account_access_snapshot();
 BEGIN
  PERFORM public.account_email_verified(fixture,fixture_email);
  RAISE EXCEPTION 'browser forged verification';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO private.email_ownership(user_id,email,method) VALUES(fixture,fixture_email,'owner_grandfathered');
  RAISE EXCEPTION 'browser grandfathered itself';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 IF s->>'status'<>'pending' OR s->>'verified'<>'false' THEN RAISE EXCEPTION 'future signup not pending and unverified'; END IF;
 INSERT INTO private.email_ownership(user_id,email,method) VALUES(fixture,fixture_email,'owner_grandfathered');
 PERFORM public.account_email_verified(fixture,fixture_email);
 IF (SELECT method FROM private.email_ownership WHERE user_id=fixture)<>'supabase_email_token'
  THEN RAISE EXCEPTION 'genuine token did not replace provenance'; END IF;
 UPDATE private.email_ownership SET method='owner_grandfathered' WHERE user_id=fixture;
 UPDATE auth.users SET email='changed-'||fixture_email WHERE id=fixture;
 IF EXISTS(SELECT FROM private.email_ownership WHERE user_id=fixture)
  OR public.account_access_snapshot()->>'verified'<>'false'
  THEN RAISE EXCEPTION 'email change retained grandfathered evidence'; END IF;
 IF (SELECT enabled OR ever_enabled FROM public.account_access WHERE user_id=fixture)
  THEN RAISE EXCEPTION 'verification changed access'; END IF;
END $proof$;
