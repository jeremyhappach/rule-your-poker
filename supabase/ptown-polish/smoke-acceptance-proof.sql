-- Rollback-only fresh admission -> roll -> evaluated offer -> actual bank.
-- The deterministic random source exists only inside this test transaction.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='25s';
SELECT set_config('app.ptown_polish_release_sha',(SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication'),true);
-- ACTIVATE_QUALIFIED_RULES
DO $$
DECLARE actor uuid:=gen_random_uuid();v jsonb;rid uuid;before_v jsonb;request uuid;
 cases jsonb:='[{"dice":[5,6,6,5,5],"label":"Three 5s","points":382,"natural":true},{"dice":[6,2,1,3,4],"label":"Pair of 6s","points":99,"natural":false},{"dice":[2,3,4,5,6],"label":"High card","points":33,"natural":false}]';
 item jsonb;definition text;reply jsonb;
BEGIN
 SELECT pg_get_functiondef('private.horses_blitz_roll(jsonb,integer[])'::regprocedure) INTO definition;
 IF position('get_byte(extensions.gen_random_bytes(1),0)' IN definition)=0 THEN RAISE EXCEPTION 'random source changed';END IF;
 EXECUTE replace(definition,'get_byte(extensions.gen_random_bytes(1),0)','((current_setting(''app.hb_acceptance_dice'')::jsonb->>i)::integer-1)');
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'Smoke proof',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 FOR item IN SELECT value FROM jsonb_array_elements(cases) LOOP
  PERFORM set_config('app.hb_acceptance_dice',(item->'dice')::text,true);
  v:=public.arcade_start(actor,gen_random_uuid(),'horses-blitz');rid:=(v->>'id')::uuid;
  v:=public.arcade_horses_blitz_step(actor,rid)->'projection';
  IF v->>'ruleset'<>'horses-blitz/4' OR v->>'roll'<>'0' THEN RAISE EXCEPTION 'wrong new-game admission';END IF;
  v:=public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'roll','{}')->'projection';
  IF v->'dice'<>item->'dice' OR v#>'{set,points}'<>item->'points' OR v#>'{set,label}'<>item->'label' OR v#>'{set,natural}'<>item->'natural' THEN RAISE EXCEPTION 'offer mismatch: %',v;END IF;
  before_v:=v;request:=gen_random_uuid();
  v:=public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',request,'bank','{}')->'projection';
  IF v->'base'<>item->'points' OR v->'score'<>item->'points' OR v#>'{bank,points}'<>item->'points'
   OR (SELECT state#>'{hands,0,points}' FROM private.arcade_runs WHERE id=rid)<>item->'points' THEN RAISE EXCEPTION 'bank mismatch: %',v;END IF;
  reply:=public.arcade_horses_blitz_step(actor,rid,(before_v->>'revision')::bigint,before_v->>'roundId',request,'bank','{}');
  IF reply->>'outcome'<>'duplicate' OR (SELECT jsonb_array_length(state->'hands') FROM private.arcade_runs WHERE id=rid)<>1 THEN RAISE EXCEPTION 'duplicate bank';END IF;
  PERFORM public.arcade_horses_blitz_step(actor,rid,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'abandon','{}');
 END LOOP;
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id='357-drop/5' AND enabled) THEN RAISE EXCEPTION 'Drop admission mismatch';END IF;
END$$;
ROLLBACK;
SELECT 'PASS: guarded admission and real Roll 1 offer/bank: Three 5s natural 382/382; wild Pair of 6s 99/99; High card 33/33; duplicate banks remain single; all synthetic state rolled back' result;
