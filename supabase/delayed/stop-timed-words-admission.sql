-- Restore the previous offer for NEW invitations only. Timed invitations and active games keep their frozen rules.
CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); receipt private.delayed_requests; fingerprint jsonb; parent uuid:=gen_random_uuid(); item jsonb; i integer:=0;
 cfg jsonb; frozen jsonb:='[]';
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 fingerprint:=jsonb_build_object('op','create','opponent',p_opponent,'realMoney',p_real_money,'lineup',p_lineup);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.match_id; END IF;
 PERFORM private.delayed_actor(p_opponent);
 IF actor_i=p_opponent OR p_real_money IS NULL OR jsonb_typeof(p_lineup) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineup) NOT BETWEEN 1 AND 32
 THEN RAISE EXCEPTION 'delayed:invalid_offer'; END IF;
 IF NOT private.delayed_multi_enabled() AND (jsonb_array_length(p_lineup)<>1 OR p_lineup->0->>'game'<>'ptown-words') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 IF p_real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lineup) LOOP
  IF coalesce(item->>'game','') NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (item-ARRAY['game','stake','config'])<>'{}'::jsonb OR jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();
  WHEN 'take-two' THEN
   IF NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
   cfg:=private.take_two_rules('take-two/2');
  WHEN 'mega-card-golf' THEN
   IF NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(actor_i,p_opponent,p_request,NULL,p_real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
   cfg:=private.mega_competition_config(item->'config');END CASE;
  IF item ? 'config' AND item->'config' IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'delayed:unsupported_configuration'; END IF;
  frozen:=frozen||jsonb_build_array(item||jsonb_build_object('config',cfg));
 END LOOP;
 IF EXISTS(SELECT FROM private.mega_test_accounts WHERE user_id IN(actor_i,p_opponent)) THEN
  IF NOT private.mega_test_async_allowed(actor_i,p_opponent,p_request,NULL,p_real_money) OR jsonb_array_length(p_lineup)>4 OR EXISTS(SELECT FROM jsonb_array_elements(p_lineup) x WHERE x->>'game'<>'mega-card-golf') THEN RAISE EXCEPTION 'mega:test_offer_scope';END IF;
  UPDATE private.mega_test_async SET match_id=parent WHERE actor=actor_i AND request_id=p_request AND match_id IS NULL;
 END IF;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(parent,actor_i,p_opponent,p_real_money,frozen,md5(frozen::text));
 FOR item IN SELECT value FROM jsonb_array_elements(frozen) LOOP
  i:=i+1;INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config) VALUES(parent,i,item->>'game',(item->>'stake')::integer,item->'config');
 END LOOP;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,parent,jsonb_build_object('id',parent));
 PERFORM private.delayed_notify(parent);
 RETURN parent;
END $function$;
CREATE OR REPLACE FUNCTION public.delayed_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',NOT coalesce((SELECT real_qualified FROM private.delayed_release WHERE singleton),false),'max_children',CASE WHEN private.delayed_multi_enabled() THEN 32 ELSE 1 END,'games',CASE WHEN NOT private.delayed_multi_enabled() THEN jsonb_build_array(jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3'))) ELSE jsonb_build_array(
 jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3')),
 jsonb_build_object('id','run21','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='run21'),'rules',(SELECT config FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21')),
 jsonb_build_object('id','tri-towers','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='tri-towers'),'rules',private.tri_towers_rules()),
 jsonb_build_object('id','quintzee','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='quintzee'),'rules',private.quintzee_default_rules()),
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules()))||CASE WHEN (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR (private.mega_test_actor(auth.uid()) AND EXISTS(SELECT FROM private.mega_test_async WHERE actor=auth.uid() AND expires_at>statement_timestamp() AND match_id IS NULL)) THEN jsonb_build_array(jsonb_build_object('id','mega-card-golf','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='mega-card-golf'),'rules',private.mega_competition_config(),'courses',private.mega_competition_courses())) ELSE '[]'::jsonb END
 ||CASE WHEN (SELECT enabled FROM private.delayed_take_two_release WHERE singleton)
 THEN jsonb_build_array(jsonb_build_object('id','take-two','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='take-two'),'rules',private.take_two_rules('take-two/2')))
 ELSE '[]'::jsonb END END) WHERE auth.uid() IS NOT NULL
$function$;
