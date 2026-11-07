-- Run after the candidate migration inside BEGIN/ROLLBACK. Uses existing
-- identities for their actual roles; never edits profiles, roles or accounts.
DO $proof$
DECLARE
 admin_id uuid; player_id uuid; disabled_admin uuid;
 baseline jsonb; candidate jsonb; observed jsonb;
 initial_revision bigint; observed_revision bigint; changed integer;
BEGIN
 SELECT p.id INTO admin_id FROM public.profiles p
  WHERE p.is_active AND private.account_enabled(p.id) AND public.is_admin(p.id)
  ORDER BY p.id LIMIT 1;
 SELECT p.id INTO player_id FROM public.profiles p
  WHERE p.is_active AND private.account_enabled(p.id) AND NOT public.is_admin(p.id)
  ORDER BY p.id LIMIT 1;
 SELECT p.id INTO disabled_admin FROM public.profiles p
  WHERE NOT private.account_enabled(p.id) AND public.is_admin(p.id)
  ORDER BY p.id LIMIT 1;
 ASSERT admin_id IS NOT NULL AND player_id IS NOT NULL,'Need actual active admin and player roles';
 SELECT layout,revision INTO STRICT baseline,initial_revision FROM public.arcade_lobby_layout WHERE id;
 ASSERT EXISTS(SELECT 1 FROM pg_index WHERE indrelid='public.arcade_lobby_layout'::regclass AND indisprimary);
 ASSERT NOT has_column_privilege('authenticated','public.arcade_lobby_layout','revision','UPDATE');
 ASSERT NOT has_column_privilege('authenticated','public.arcade_lobby_layout','updated_by','UPDATE');

 PERFORM set_config('request.jwt.claim.sub',player_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',player_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT layout INTO STRICT observed FROM public.arcade_lobby_layout WHERE id;
 ASSERT observed=baseline,'Player sees shared layout';
 UPDATE public.arcade_lobby_layout SET layout='{"originals":[],"other":[]}' WHERE id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 ASSERT changed=0,'Regular player must not publish';
 BEGIN
  UPDATE public.arcade_lobby_layout SET revision=0 WHERE id;
  RAISE EXCEPTION 'Revision write unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 -- Distinct ordering of the same visible keys, with cross-section movement.
 candidate=jsonb_build_object('originals',jsonb_build_array('run21','chucky-showdown','crib-lab','357-drop','horses-blitz'),
   'other',jsonb_build_array('tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash','mega-card-golf','quintzee'));
 UPDATE public.arcade_lobby_layout SET layout=candidate WHERE id AND revision=initial_revision
  RETURNING layout,revision INTO observed,observed_revision;
 ASSERT observed=candidate AND observed_revision=initial_revision+1,'Atomic membership and ordering save';
 ASSERT (SELECT updated_by=admin_id FROM public.arcade_lobby_layout WHERE id),'Server-owned audit identity';
 UPDATE public.arcade_lobby_layout SET layout=baseline WHERE id AND revision=initial_revision;
 GET DIAGNOSTICS changed=ROW_COUNT;
 ASSERT changed=0,'Stale write rejected';
 UPDATE public.arcade_lobby_layout SET layout=candidate WHERE id AND revision=observed_revision;
 ASSERT (SELECT revision=observed_revision FROM public.arcade_lobby_layout WHERE id),'Identical replay is a no-op';
 BEGIN
  UPDATE public.arcade_lobby_layout SET layout='{"originals":["run21"],"other":["run21"]}' WHERE id;
  RAISE EXCEPTION 'Duplicate game unexpectedly allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  UPDATE public.arcade_lobby_layout SET layout='{"originals":[],"other":[7]}' WHERE id;
  RAISE EXCEPTION 'Invalid key unexpectedly allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 ASSERT (SELECT layout=candidate AND revision=observed_revision FROM public.arcade_lobby_layout WHERE id),'Invalid writes leave whole row unchanged';
 BEGIN
  DELETE FROM public.arcade_lobby_layout;
  RAISE EXCEPTION 'Deletion unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claim.sub',player_id::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT layout INTO STRICT observed FROM public.arcade_lobby_layout WHERE id;
 ASSERT observed=candidate,'Another player reads full published layout';
 EXECUTE 'RESET ROLE';
 IF disabled_admin IS NOT NULL THEN
  PERFORM set_config('request.jwt.claim.sub',disabled_admin::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT NOT EXISTS(SELECT FROM public.arcade_lobby_layout),'Disabled admin cannot read';
  UPDATE public.arcade_lobby_layout SET layout=baseline WHERE id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  ASSERT changed=0,'Disabled admin cannot save';
  EXECUTE 'RESET ROLE';
 END IF;
 EXECUTE 'SET LOCAL ROLE anon';
 BEGIN
  PERFORM layout FROM public.arcade_lobby_layout;
  RAISE EXCEPTION 'Anonymous read unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
END $proof$;
