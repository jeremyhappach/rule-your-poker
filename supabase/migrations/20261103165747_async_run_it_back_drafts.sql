SET LOCAL lock_timeout='3s';
-- Async Run It Back: production release explicitly authorized 2026-11-03.
-- No historical backfill, gameplay, financial, acceptance or settlement changes.
CREATE TABLE IF NOT EXISTS private.delayed_runback_viewers (
 match_id uuid PRIMARY KEY REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 viewer uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
);
ALTER TABLE private.delayed_runback_viewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_runback_viewers FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='private.delayed_runback_viewers'::regclass AND tgname='delayed_runback_viewer_immutable') THEN
  CREATE TRIGGER delayed_runback_viewer_immutable BEFORE UPDATE OR DELETE ON private.delayed_runback_viewers FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
 END IF;
END $$;

DO $guard$
DECLARE source text:=replace(pg_get_functiondef('public.delayed_finale_ack(uuid)'::regprocedure),chr(13),'');
BEGIN
 IF source=replace($before$CREATE OR REPLACE FUNCTION public.delayed_finale_ack(p_match uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent) AND status='settled' FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 -- Same parent lock as child ACKs. Check even when an older client already ACKed
 -- the finale prematurely; leave that immutable receipt untouched.
 IF NOT private.delayed_reviews_complete(m.id,who) THEN RAISE EXCEPTION 'delayed:reviews_pending' USING ERRCODE='55000';END IF;
 INSERT INTO private.delayed_finale_seen VALUES(m.id,who,clock_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$
$before$,chr(13),'') THEN EXECUTE replace($after$CREATE OR REPLACE FUNCTION public.delayed_finale_ack(p_match uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent) AND status='settled' FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 -- Same parent lock as child ACKs. Check even when an older client already ACKed
 -- the finale prematurely; leave that immutable receipt untouched.
 IF NOT private.delayed_reviews_complete(m.id,who) THEN RAISE EXCEPTION 'delayed:reviews_pending' USING ERRCODE='55000';END IF;
 INSERT INTO private.delayed_finale_seen VALUES(m.id,who,clock_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 -- The existing parent lock serializes both viewers; only the second fresh ACK wins.
 IF EXISTS(SELECT FROM private.delayed_finale_seen s WHERE s.match_id=m.id AND s.viewer<>who)
    AND private.delayed_reviews_complete(m.id,m.organizer)
    AND private.delayed_reviews_complete(m.id,m.opponent) THEN
  INSERT INTO private.delayed_runback_viewers(match_id,viewer) VALUES(m.id,who) ON CONFLICT(match_id) DO NOTHING;
 END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$
$after$,chr(13),'');
 ELSIF source IS DISTINCT FROM replace($after$CREATE OR REPLACE FUNCTION public.delayed_finale_ack(p_match uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent) AND status='settled' FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 -- Same parent lock as child ACKs. Check even when an older client already ACKed
 -- the finale prematurely; leave that immutable receipt untouched.
 IF NOT private.delayed_reviews_complete(m.id,who) THEN RAISE EXCEPTION 'delayed:reviews_pending' USING ERRCODE='55000';END IF;
 INSERT INTO private.delayed_finale_seen VALUES(m.id,who,clock_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 -- The existing parent lock serializes both viewers; only the second fresh ACK wins.
 IF EXISTS(SELECT FROM private.delayed_finale_seen s WHERE s.match_id=m.id AND s.viewer<>who)
    AND private.delayed_reviews_complete(m.id,m.organizer)
    AND private.delayed_reviews_complete(m.id,m.opponent) THEN
  INSERT INTO private.delayed_runback_viewers(match_id,viewer) VALUES(m.id,who) ON CONFLICT(match_id) DO NOTHING;
 END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$
$after$,chr(13),'') THEN RAISE EXCEPTION 'runback:source_changed public.delayed_finale_ack(uuid)'; END IF;
END $guard$;
DO $guard$
DECLARE source text:=replace(pg_get_functiondef('public.delayed_history_detail(uuid)'::regprocedure),chr(13),'');
BEGIN
 IF source=replace($before$CREATE OR REPLACE FUNCTION public.delayed_history_detail(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;original jsonb;
BEGIN
 h:=public.delayed_home(p_match);
 original:=public.delayed_home_before_reviews(p_match);
 IF h->>'status'<>'settled' THEN RAISE EXCEPTION 'delayed:not_complete';END IF;
 RETURN h||jsonb_build_object('lineup',(SELECT jsonb_agg(item||jsonb_build_object('result',saved->'result') ORDER BY (item->>'ordinal')::int) FROM jsonb_array_elements(h->'lineup') item JOIN jsonb_array_elements(original->'lineup') saved ON item->>'id'=saved->>'id'),'unsettled',0,'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=auth.uid()));
END $function$
$before$,chr(13),'') THEN EXECUTE replace($after$CREATE OR REPLACE FUNCTION public.delayed_history_detail(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;original jsonb;
BEGIN
 h:=public.delayed_home(p_match);
 original:=public.delayed_home_before_reviews(p_match);
 IF h->>'status'<>'settled' THEN RAISE EXCEPTION 'delayed:not_complete';END IF;
 RETURN h||jsonb_build_object(
  'runbackEligible',EXISTS(SELECT FROM private.delayed_runback_viewers WHERE match_id=p_match AND viewer=auth.uid()),
  'opponentEligible',private.delayed_human((CASE WHEN h->>'organizer'=auth.uid()::text THEN h->>'opponent' ELSE h->>'organizer' END)::uuid),
  'policyVersion',(SELECT policy_version FROM private.delayed_matches WHERE id=p_match))||jsonb_build_object('lineup',(SELECT jsonb_agg(item||jsonb_build_object('result',saved->'result') ORDER BY (item->>'ordinal')::int) FROM jsonb_array_elements(h->'lineup') item JOIN jsonb_array_elements(original->'lineup') saved ON item->>'id'=saved->>'id'),'unsettled',0,'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=auth.uid()));
END $function$
$after$,chr(13),'');
 ELSIF source IS DISTINCT FROM replace($after$CREATE OR REPLACE FUNCTION public.delayed_history_detail(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;original jsonb;
BEGIN
 h:=public.delayed_home(p_match);
 original:=public.delayed_home_before_reviews(p_match);
 IF h->>'status'<>'settled' THEN RAISE EXCEPTION 'delayed:not_complete';END IF;
 RETURN h||jsonb_build_object(
  'runbackEligible',EXISTS(SELECT FROM private.delayed_runback_viewers WHERE match_id=p_match AND viewer=auth.uid()),
  'opponentEligible',private.delayed_human((CASE WHEN h->>'organizer'=auth.uid()::text THEN h->>'opponent' ELSE h->>'organizer' END)::uuid),
  'policyVersion',(SELECT policy_version FROM private.delayed_matches WHERE id=p_match))||jsonb_build_object('lineup',(SELECT jsonb_agg(item||jsonb_build_object('result',saved->'result') ORDER BY (item->>'ordinal')::int) FROM jsonb_array_elements(h->'lineup') item JOIN jsonb_array_elements(original->'lineup') saved ON item->>'id'=saved->>'id'),'unsettled',0,'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=auth.uid()));
END $function$
$after$,chr(13),'') THEN RAISE EXCEPTION 'runback:source_changed public.delayed_history_detail(uuid)'; END IF;
END $guard$;
DO $guard$
DECLARE source text:=replace(pg_get_functiondef('public.delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure),chr(13),'');
BEGIN
 IF source=replace($before$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
$before$,chr(13),'') THEN EXECUTE replace($after$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
   OR (item-ARRAY['game','stake','config'])<>'{}'::jsonb OR jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();END CASE;
  IF item ? 'config' AND item->'config' IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'delayed:unsupported_configuration'; END IF;
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
$after$,chr(13),'');
 ELSIF source IS DISTINCT FROM replace($after$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
   OR (item-ARRAY['game','stake','config'])<>'{}'::jsonb OR jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();END CASE;
  IF item ? 'config' AND item->'config' IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'delayed:unsupported_configuration'; END IF;
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
$after$,chr(13),'') THEN RAISE EXCEPTION 'runback:source_changed public.delayed_create(uuid,uuid,boolean,jsonb)'; END IF;
END $guard$;
