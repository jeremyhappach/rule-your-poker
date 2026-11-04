-- Run only inside a rollback-contained transaction.
DO $proof$
DECLARE admin_i uuid:=gen_random_uuid(); user_i uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 address text; attempt jsonb; snapshot jsonb; balances jsonb; notice uuid; row_i record;
BEGIN
 INSERT INTO auth.users(id,email,created_at) VALUES(admin_i,'smoke-admin-'||admin_i||'@example.invalid',clock_timestamp());
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=admin_i;
 UPDATE public.profiles SET is_active=true WHERE id=admin_i;
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_i,'admin');
 address:='smoke-user-'||user_i||'@example.invalid';
 INSERT INTO auth.users(id,email,created_at) VALUES(user_i,address,clock_timestamp()),(outsider,'smoke-other-'||outsider||'@example.invalid',clock_timestamp());
 SELECT id INTO STRICT notice FROM public.platform_notifications WHERE user_id=admin_i AND registration_user_id=user_i AND kind='registration';
 attempt:=public.account_email_dispatch_start(user_i,user_i,true);
 IF attempt->>'email'<>address OR (attempt->>'skipped')::boolean THEN RAISE EXCEPTION 'initial send absent'; END IF;
 IF public.account_email_dispatch_start(user_i,user_i,true)->>'skipped'<>'true' THEN RAISE EXCEPTION 'initial duplicate dispatched'; END IF;
 BEGIN PERFORM public.account_email_dispatch_start(outsider,user_i,false); RAISE EXCEPTION 'unauthorized resend'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.account_email_dispatch_finish(user_i,(attempt->>'attemptId')::uuid,false);
 PERFORM set_config('request.jwt.claim.sub',user_i::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_i,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 snapshot:=public.account_access_snapshot();
 IF snapshot->>'verified'<>'false' OR snapshot->>'status'<>'pending' OR snapshot->>'emailDelivery'<>'failed' THEN RAISE EXCEPTION 'failed dispatch snapshot'; END IF;
 BEGIN PERFORM public.account_email_dispatch_finish(user_i,(attempt->>'attemptId')::uuid,true); RAISE EXCEPTION 'browser forged delivery'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_account_balances(); RAISE EXCEPTION 'non-admin saw balances'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT FROM public.platform_notifications WHERE id=notice) THEN RAISE EXCEPTION 'other user saw registration'; END IF;
 RESET ROLE;
 UPDATE private.email_verification_requests SET requested_at=clock_timestamp()-interval '61 seconds' WHERE user_id=user_i;
 attempt:=public.account_email_dispatch_start(admin_i,user_i,false);
 PERFORM public.account_email_dispatch_finish(user_i,gen_random_uuid(),true);
 IF public.account_access_snapshot()->>'emailDelivery'<>'requested' THEN RAISE EXCEPTION 'stale dispatch overwrote current'; END IF;
 PERFORM public.account_email_dispatch_finish(user_i,(attempt->>'attemptId')::uuid,true);
 IF public.account_access_snapshot()->>'verified'<>'false' OR public.account_access_snapshot()->>'emailDelivery'<>'accepted' THEN RAISE EXCEPTION 'dispatch granted verification'; END IF;

 PERFORM set_config('request.jwt.claim.sub',admin_i::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_i,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') n WHERE n->>'id'=notice::text) THEN RAISE EXCEPTION 'bell registration missing'; END IF;
 PERFORM public.admin_set_account_access(user_i,true);
 IF EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') n WHERE n->>'id'=notice::text) THEN RAISE EXCEPTION 'stale approval action'; END IF;
 PERFORM public.admin_set_account_access(user_i,false);
 balances:=public.admin_account_balances();
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(balances) b WHERE b->>'id'=user_i::text AND b->>'enabled'='false') THEN RAISE EXCEPTION 'disabled balance absent'; END IF;
 PERFORM public.account_statement(user_i);
 RESET ROLE;
 FOR row_i IN SELECT p.id,p.is_active,coalesce(sum(t.amount),0)::text balance
  FROM public.profiles p JOIN auth.users u ON u.id=p.id LEFT JOIN public.player_transactions t ON t.profile_id=p.id GROUP BY p.id,p.is_active
 LOOP
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(balances) b WHERE b->>'id'=row_i.id::text AND (b->>'balance')::numeric=row_i.balance::numeric AND (b->>'enabled')::boolean=row_i.is_active)
   THEN RAISE EXCEPTION 'canonical balance changed or account omitted'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM private.account_access_audit WHERE user_id=user_i)<>2 THEN RAISE EXCEPTION 'audit changes not preserved'; END IF;
 IF (SELECT verified FROM jsonb_to_record(public.account_access_snapshot()) AS x(verified boolean)) THEN RAISE EXCEPTION 'fixture admin unexpectedly verified'; END IF;
 DELETE FROM public.user_roles WHERE user_id=admin_i AND role='admin';
 SET LOCAL ROLE authenticated;
 IF EXISTS(SELECT FROM public.platform_notifications WHERE user_id=admin_i AND kind='registration') THEN RAISE EXCEPTION 'revoked admin sees registration'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') n WHERE n->>'kind'='registration') THEN RAISE EXCEPTION 'revoked admin sees bell approval'; END IF;
 RESET ROLE;
END $proof$;
