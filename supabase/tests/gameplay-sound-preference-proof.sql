-- Prepend BEGIN and the candidate definition to test before installation.
-- To test the installed function, prepend only BEGIN.
CREATE TEMP TABLE sound_fixture(owner_id uuid, other_id uuid, blocked_id uuid);
INSERT INTO sound_fixture VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
INSERT INTO auth.users(id)
 SELECT owner_id FROM sound_fixture UNION ALL SELECT other_id FROM sound_fixture UNION ALL SELECT blocked_id FROM sound_fixture;
UPDATE public.account_access SET enabled=true,ever_enabled=true
 WHERE user_id IN(SELECT owner_id FROM sound_fixture UNION ALL SELECT other_id FROM sound_fixture);
INSERT INTO public.profiles(id,username,is_active)
 SELECT owner_id,'Sound save proof '||owner_id,true FROM sound_fixture
 UNION ALL SELECT other_id,'Sound save proof '||other_id,true FROM sound_fixture
 UNION ALL SELECT blocked_id,'Sound save proof '||blocked_id,false FROM sound_fixture
 ON CONFLICT(id) DO UPDATE SET username=excluded.username,is_active=excluded.is_active;
CREATE TEMP TABLE sound_before AS
 SELECT p.id,to_jsonb(p)-'play_sounds' AS fields,p.play_sounds
 FROM public.profiles p JOIN sound_fixture f ON p.id IN(f.owner_id,f.other_id,f.blocked_id);
SELECT set_config('request.jwt.claim.sub',owner_id::text,true),
       set_config('test.sound_other',other_id::text,true),
       set_config('test.sound_blocked',blocked_id::text,true)
 FROM sound_fixture;

-- The fixture's privileged profile inserts may have cached the trigger's
-- expression plan. A fresh browser connection must resolve it as authenticated.
DISCARD PLANS;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
 actor uuid:=auth.uid();
 other uuid:=current_setting('test.sound_other')::uuid;
 blocked uuid:=current_setting('test.sound_blocked')::uuid;
 saved boolean;
BEGIN
 BEGIN
  UPDATE public.profiles SET play_sounds=false WHERE id=actor;
  RAISE EXCEPTION 'old browser path unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%schema private%' THEN RAISE; END IF;
 END;
 saved:=public.set_gameplay_sound_preference(actor,false);
 IF saved IS DISTINCT FROM false OR (SELECT play_sounds FROM public.profiles WHERE id=actor) IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'mute was not persisted';
 END IF;
 saved:=public.set_gameplay_sound_preference(actor,true);
 IF saved IS DISTINCT FROM true OR (SELECT play_sounds FROM public.profiles WHERE id=actor) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'unmute was not persisted';
 END IF;
 IF public.set_gameplay_sound_preference(actor,true) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'replaying the same value failed';
 END IF;
 BEGIN
  PERFORM public.set_gameplay_sound_preference(other,false);
  RAISE EXCEPTION 'cross-account write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.set_gameplay_sound_preference(actor,NULL);
  RAISE EXCEPTION 'null value accepted';
 EXCEPTION WHEN null_value_not_allowed THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub',blocked::text,true);
 BEGIN
  PERFORM public.set_gameplay_sound_preference(blocked,false);
  RAISE EXCEPTION 'blocked account wrote a preference';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$$;
RESET ROLE;

DO $$
BEGIN
 IF EXISTS(SELECT FROM sound_before b JOIN public.profiles p USING(id) WHERE b.fields IS DISTINCT FROM to_jsonb(p)-'play_sounds') THEN
  RAISE EXCEPTION 'unrelated profile field changed';
 END IF;
 IF EXISTS(SELECT FROM sound_before b JOIN public.profiles p USING(id) CROSS JOIN sound_fixture f
           WHERE b.id<>f.owner_id AND b.play_sounds IS DISTINCT FROM p.play_sounds) THEN
  RAISE EXCEPTION 'another account preference changed';
 END IF;
 IF has_function_privilege('anon','public.set_gameplay_sound_preference(uuid,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'anonymous execution is available';
 END IF;
END
$$;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'fixture_profiles_remaining',
 (SELECT count(*) FROM public.profiles WHERE username LIKE 'Sound save proof %')) AS proof;
