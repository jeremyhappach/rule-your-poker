SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
-- Real-money async admission; installed closed until complete financial qualification and exact-SHA publication.
-- Existing human eligibility, stakes, frozen rules, private outcomes and canonical financial owners are retained.
ALTER TABLE private.delayed_release ADD COLUMN IF NOT EXISTS real_qualified boolean NOT NULL DEFAULT false;

DO $guard$
DECLARE source text:=replace(pg_get_functiondef('delayed_capabilities()'::regprocedure),chr(13),'');
BEGIN
 IF source=$before$CREATE OR REPLACE FUNCTION public.delayed_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',true,'max_children',CASE WHEN private.delayed_multi_enabled() THEN 32 ELSE 1 END,'games',CASE WHEN NOT private.delayed_multi_enabled() THEN jsonb_build_array(jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3'))) ELSE jsonb_build_array(
 jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3')),
 jsonb_build_object('id','run21','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='run21'),'rules',(SELECT config FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21')),
 jsonb_build_object('id','tri-towers','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='tri-towers'),'rules',private.tri_towers_rules()),
 jsonb_build_object('id','quintzee','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='quintzee'),'rules',private.quintzee_default_rules()),
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules())) END) WHERE auth.uid() IS NOT NULL
$function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_capabilities()
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
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules())) END) WHERE auth.uid() IS NOT NULL
$function$
$after$;
 ELSIF source IS DISTINCT FROM $after$CREATE OR REPLACE FUNCTION public.delayed_capabilities()
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
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules())) END) WHERE auth.uid() IS NOT NULL
$function$
$after$ THEN RAISE EXCEPTION 'async_real:source_changed delayed_capabilities()';END IF;
END $guard$;

DO $guard$
DECLARE source text:=replace(pg_get_functiondef('delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure),chr(13),'');
BEGIN
 IF source=$before$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
 IF actor_i=p_opponent OR p_real_money IS NULL OR jsonb_typeof(p_lineup) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineup) NOT BETWEEN 1 AND 32 OR p_real_money
 THEN RAISE EXCEPTION 'delayed:invalid_offer'; END IF;
 IF NOT private.delayed_multi_enabled() AND (jsonb_array_length(p_lineup)<>1 OR p_lineup->0->>'game'<>'ptown-words') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lineup) LOOP
  IF coalesce(item->>'game','') NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();END CASE;
  frozen:=frozen||jsonb_build_array(item||jsonb_build_object('config',cfg));
 END LOOP;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(parent,actor_i,p_opponent,p_real_money,frozen,md5(frozen::text));
 FOR item IN SELECT value FROM jsonb_array_elements(frozen) LOOP
  i:=i+1;INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config) VALUES(parent,i,item->>'game',(item->>'stake')::integer,item->'config');
 END LOOP;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,parent,jsonb_build_object('id',parent));
 PERFORM private.delayed_notify(parent);
 RETURN parent;
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
  IF coalesce(item->>'game','') NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();END CASE;
  frozen:=frozen||jsonb_build_array(item||jsonb_build_object('config',cfg));
 END LOOP;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(parent,actor_i,p_opponent,p_real_money,frozen,md5(frozen::text));
 FOR item IN SELECT value FROM jsonb_array_elements(frozen) LOOP
  i:=i+1;INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config) VALUES(parent,i,item->>'game',(item->>'stake')::integer,item->'config');
 END LOOP;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,parent,jsonb_build_object('id',parent));
 PERFORM private.delayed_notify(parent);
 RETURN parent;
END $function$
$after$;
 ELSIF source IS DISTINCT FROM $after$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
  IF coalesce(item->>'game','') NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();END CASE;
  frozen:=frozen||jsonb_build_array(item||jsonb_build_object('config',cfg));
 END LOOP;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(parent,actor_i,p_opponent,p_real_money,frozen,md5(frozen::text));
 FOR item IN SELECT value FROM jsonb_array_elements(frozen) LOOP
  i:=i+1;INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config) VALUES(parent,i,item->>'game',(item->>'stake')::integer,item->'config');
 END LOOP;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,parent,jsonb_build_object('id',parent));
 PERFORM private.delayed_notify(parent);
 RETURN parent;
END $function$
$after$ THEN RAISE EXCEPTION 'async_real:source_changed delayed_create(uuid,uuid,boolean,jsonb)';END IF;
END $guard$;

DO $guard$
DECLARE source text:=replace(pg_get_functiondef('delayed_respond(uuid,uuid,text,text)'::regprocedure),chr(13),'');
BEGIN
 IF source=$before$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF m.real_money OR c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
$after$;
 ELSIF source IS DISTINCT FROM $after$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
$after$ THEN RAISE EXCEPTION 'async_real:source_changed delayed_respond(uuid,uuid,text,text)';END IF;
END $guard$;

DO $guard$
DECLARE source text:=replace(pg_get_functiondef('delayed_words_snapshot(uuid)'::regprocedure),chr(13),'');
BEGIN
 IF source=$before$CREATE OR REPLACE FUNCTION public.delayed_words_snapshot(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();
BEGIN
 PERFORM private.delayed_actor(who);
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' OR m.real_money THEN RAISE EXCEPTION 'delayed:scope_closed';END IF; -- Read may catch up an overdue turn; it never creates a fresh availability window.
 IF NOT c.terminal AND NOT private.delayed_held(m.id) THEN PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);END IF;
 RETURN private.delayed_words_view(p_child,who);
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_words_snapshot(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();
BEGIN
 PERFORM private.delayed_actor(who);
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:scope_closed';END IF; -- Read may catch up an overdue turn; it never creates a fresh availability window.
 IF NOT c.terminal AND NOT private.delayed_held(m.id) THEN PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);END IF;
 RETURN private.delayed_words_view(p_child,who);
END $function$
$after$;
 ELSIF source IS DISTINCT FROM $after$CREATE OR REPLACE FUNCTION public.delayed_words_snapshot(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();
BEGIN
 PERFORM private.delayed_actor(who);
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:scope_closed';END IF; -- Read may catch up an overdue turn; it never creates a fresh availability window.
 IF NOT c.terminal AND NOT private.delayed_held(m.id) THEN PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);END IF;
 RETURN private.delayed_words_view(p_child,who);
END $function$
$after$ THEN RAISE EXCEPTION 'async_real:source_changed delayed_words_snapshot(uuid)';END IF;
END $guard$;

DO $guard$
DECLARE source text:=replace(pg_get_functiondef('delayed_words_action(uuid,uuid,bigint,text,jsonb)'::regprocedure),chr(13),'');
BEGIN
 IF source=$before$CREATE OR REPLACE FUNCTION public.delayed_words_action(p_child uuid, p_request uuid, p_revision bigint, p_action text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE who uuid:=auth.uid();c private.delayed_children;m private.delayed_matches;prior private.delayed_word_commands;
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'action',p_action,'items',p_items);s jsonb;answer jsonb;at_time timestamptz;at_ms bigint;winner uuid;rejection text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_request::text,317));
 SELECT * INTO prior FROM private.delayed_word_commands WHERE actor=who AND request_id=p_request;
 IF FOUND THEN IF prior.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;RETURN prior.response;END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' OR m.real_money THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000);
 IF NOT c.terminal AND NOT private.delayed_held(m.id) AND at_time>=c.expires_at THEN
  PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
  answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:deadline');
 ELSIF c.terminal THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:terminal');
 ELSE
  IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:on_hold';END IF;
  IF c.actor IS DISTINCT FROM who THEN RAISE EXCEPTION 'delayed:not_your_turn' USING ERRCODE='42501';END IF;
  IF p_revision IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'delayed:stale_revision';END IF;
  IF p_action IS NULL OR p_action NOT IN('place','pass','exchange') OR (p_action='pass' AND p_items IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_action';END IF;
  BEGIN s:=private.ptown_words_reduce(c.state,p_action,p_items,at_ms);
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS rejection=MESSAGE_TEXT;END;
  IF rejection IS NOT NULL THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error',rejection);
  ELSE
   UPDATE private.delayed_children SET state=s,revision=revision+1,
    actor=(s->'players'->(s->>'turnIndex')::int->>'id')::uuid,segment=segment+1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours'
   WHERE id=c.id RETURNING * INTO c;
   UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
   IF s->>'phase'='complete' THEN
    winner:=CASE WHEN jsonb_array_length(s->'winnerIds')=1 THEN (s->'winnerIds'->>0)::uuid END;
    PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,
     jsonb_build_object('rules',c.config,'finalState',s,'endReason',s->>'endReason'));
   ELSE PERFORM private.delayed_notify(m.id);END IF;
   answer:=private.delayed_words_view(c.id,who);
  END IF;
 END IF;
 INSERT INTO private.delayed_word_commands VALUES(who,p_request,p_child,fingerprint,answer);
 RETURN answer;
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_words_action(p_child uuid, p_request uuid, p_revision bigint, p_action text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE who uuid:=auth.uid();c private.delayed_children;m private.delayed_matches;prior private.delayed_word_commands;
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'action',p_action,'items',p_items);s jsonb;answer jsonb;at_time timestamptz;at_ms bigint;winner uuid;rejection text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_request::text,317));
 SELECT * INTO prior FROM private.delayed_word_commands WHERE actor=who AND request_id=p_request;
 IF FOUND THEN IF prior.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;RETURN prior.response;END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000);
 IF NOT c.terminal AND NOT private.delayed_held(m.id) AND at_time>=c.expires_at THEN
  PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
  answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:deadline');
 ELSIF c.terminal THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:terminal');
 ELSE
  IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:on_hold';END IF;
  IF c.actor IS DISTINCT FROM who THEN RAISE EXCEPTION 'delayed:not_your_turn' USING ERRCODE='42501';END IF;
  IF p_revision IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'delayed:stale_revision';END IF;
  IF p_action IS NULL OR p_action NOT IN('place','pass','exchange') OR (p_action='pass' AND p_items IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_action';END IF;
  BEGIN s:=private.ptown_words_reduce(c.state,p_action,p_items,at_ms);
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS rejection=MESSAGE_TEXT;END;
  IF rejection IS NOT NULL THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error',rejection);
  ELSE
   UPDATE private.delayed_children SET state=s,revision=revision+1,
    actor=(s->'players'->(s->>'turnIndex')::int->>'id')::uuid,segment=segment+1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours'
   WHERE id=c.id RETURNING * INTO c;
   UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
   IF s->>'phase'='complete' THEN
    winner:=CASE WHEN jsonb_array_length(s->'winnerIds')=1 THEN (s->'winnerIds'->>0)::uuid END;
    PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,
     jsonb_build_object('rules',c.config,'finalState',s,'endReason',s->>'endReason'));
   ELSE PERFORM private.delayed_notify(m.id);END IF;
   answer:=private.delayed_words_view(c.id,who);
  END IF;
 END IF;
 INSERT INTO private.delayed_word_commands VALUES(who,p_request,p_child,fingerprint,answer);
 RETURN answer;
END $function$
$after$;
 ELSIF source IS DISTINCT FROM $after$CREATE OR REPLACE FUNCTION public.delayed_words_action(p_child uuid, p_request uuid, p_revision bigint, p_action text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE who uuid:=auth.uid();c private.delayed_children;m private.delayed_matches;prior private.delayed_word_commands;
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'action',p_action,'items',p_items);s jsonb;answer jsonb;at_time timestamptz;at_ms bigint;winner uuid;rejection text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_request::text,317));
 SELECT * INTO prior FROM private.delayed_word_commands WHERE actor=who AND request_id=p_request;
 IF FOUND THEN IF prior.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;RETURN prior.response;END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000);
 IF NOT c.terminal AND NOT private.delayed_held(m.id) AND at_time>=c.expires_at THEN
  PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
  answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:deadline');
 ELSIF c.terminal THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error','delayed:terminal');
 ELSE
  IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:on_hold';END IF;
  IF c.actor IS DISTINCT FROM who THEN RAISE EXCEPTION 'delayed:not_your_turn' USING ERRCODE='42501';END IF;
  IF p_revision IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'delayed:stale_revision';END IF;
  IF p_action IS NULL OR p_action NOT IN('place','pass','exchange') OR (p_action='pass' AND p_items IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_action';END IF;
  BEGIN s:=private.ptown_words_reduce(c.state,p_action,p_items,at_ms);
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS rejection=MESSAGE_TEXT;END;
  IF rejection IS NOT NULL THEN answer:=private.delayed_words_view(c.id,who)||jsonb_build_object('error',rejection);
  ELSE
   UPDATE private.delayed_children SET state=s,revision=revision+1,
    actor=(s->'players'->(s->>'turnIndex')::int->>'id')::uuid,segment=segment+1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours'
   WHERE id=c.id RETURNING * INTO c;
   UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
   IF s->>'phase'='complete' THEN
    winner:=CASE WHEN jsonb_array_length(s->'winnerIds')=1 THEN (s->'winnerIds'->>0)::uuid END;
    PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,
     jsonb_build_object('rules',c.config,'finalState',s,'endReason',s->>'endReason'));
   ELSE PERFORM private.delayed_notify(m.id);END IF;
   answer:=private.delayed_words_view(c.id,who);
  END IF;
 END IF;
 INSERT INTO private.delayed_word_commands VALUES(who,p_request,p_child,fingerprint,answer);
 RETURN answer;
END $function$
$after$ THEN RAISE EXCEPTION 'async_real:source_changed delayed_words_action(uuid,uuid,bigint,text,jsonb)';END IF;
END $guard$;
