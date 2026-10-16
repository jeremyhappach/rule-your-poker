BEGIN;
SELECT set_config('arcade.proof.admin',(SELECT p.id::text FROM public.profiles p WHERE p.is_active AND public.is_admin(p.id) LIMIT 1),true);
SELECT set_config('arcade.proof.user',(SELECT p.id::text FROM public.profiles p WHERE p.is_active AND NOT public.is_admin(p.id) LIMIT 1),true);
SELECT set_config('arcade.proof.a','run21/'||gen_random_uuid()||'.png',true),set_config('arcade.proof.b','run21/'||gen_random_uuid()||'.webp',true);
SELECT set_config('request.jwt.claim.sub',current_setting('arcade.proof.admin'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer;c jsonb; BEGIN
 ASSERT public.is_admin(auth.uid()),'admin fixture';
 SELECT count(*) INTO n FROM public.arcade_game_artwork;ASSERT n=3,'eligible read';
 c=public.arcade_rules_help();ASSERT c->>'preset'='run21/2','current frozen config';
 c=public.arcade_rules_help('run21/arcade-1');ASSERT c->'speed'->>'start'='250','legacy frozen config';
 BEGIN PERFORM public.arcade_rules_help('unknown');RAISE EXCEPTION 'unknown rules allowed';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='arcade:unknown_ruleset';END;
 INSERT INTO storage.objects(bucket_id,name) VALUES('arcade-artwork',current_setting('arcade.proof.a')),('arcade-artwork',current_setting('arcade.proof.b'));
 UPDATE public.arcade_game_artwork SET object_path=current_setting('arcade.proof.a') WHERE game='run21';
 ASSERT (SELECT updated_by=auth.uid() FROM public.arcade_game_artwork WHERE game='run21'),'server attribution';
 BEGIN UPDATE public.arcade_game_artwork SET object_path='run21/'||gen_random_uuid()||'.png' WHERE game='run21';RAISE EXCEPTION 'missing object allowed';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='arcade:artwork_not_uploaded';END;
 BEGIN UPDATE public.arcade_game_artwork SET object_path=current_setting('arcade.proof.a') WHERE game='yahtzee';RAISE EXCEPTION 'cross game allowed';EXCEPTION WHEN check_violation OR unique_violation THEN NULL;END;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('arcade-artwork','run21/unsafe.svg');RAISE EXCEPTION 'bad path allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE storage.objects SET name='run21/'||gen_random_uuid()||'.png' WHERE bucket_id='arcade-artwork' AND name=current_setting('arcade.proof.a');GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=0,'immutable objects';
 UPDATE public.arcade_game_artwork SET object_path=current_setting('arcade.proof.b') WHERE game='run21' AND object_path=current_setting('arcade.proof.a');GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=1,'replace';
 UPDATE public.arcade_game_artwork SET object_path=current_setting('arcade.proof.a') WHERE game='run21' AND object_path=current_setting('arcade.proof.a');GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=0,'stale replacement';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('arcade.proof.user'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='arcade-artwork' AND name=current_setting('arcade.proof.b');ASSERT n=1,'normal user reads saved image';
 UPDATE public.arcade_game_artwork SET object_path=current_setting('arcade.proof.a') WHERE game='run21';GET DIAGNOSTICS n=ROW_COUNT;ASSERT n=0,'normal cannot replace';
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('arcade-artwork','run21/'||gen_random_uuid()||'.jpg');RAISE EXCEPTION 'normal upload allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.arcade_game_artwork SET game='yahtzee' WHERE game='run21';RAISE EXCEPTION 'identity write allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.arcade_game_artwork;ASSERT n=0,'ineligible metadata hidden';
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='arcade-artwork';ASSERT n=0,'ineligible images hidden';
 BEGIN PERFORM public.arcade_rules_help();RAISE EXCEPTION 'ineligible rules allowed';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='arcade:forbidden';END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE n integer; BEGIN
 BEGIN PERFORM 1 FROM public.arcade_game_artwork;RAISE EXCEPTION 'anonymous metadata allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='arcade-artwork';ASSERT n=0,'anonymous images hidden';
 BEGIN PERFORM public.arcade_rules_help();RAISE EXCEPTION 'anonymous rules allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT 'PASS: admin upload/replace, normal read and write denial, ineligible/anonymous denial, path validation, missing upload, CAS, immutable objects, current/legacy help' AS evidence;
ROLLBACK;
