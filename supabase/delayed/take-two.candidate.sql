-- Closed admission until matching client, worker and financial qualification pass.
CREATE TABLE IF NOT EXISTS private.delayed_take_two_release(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.delayed_take_two_release(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE private.delayed_take_two_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_take_two_release FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS private.delayed_take_two_deals(
 child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 round integer NOT NULL CHECK(round BETWEEN 1 AND 3),
 deck jsonb NOT NULL CHECK(jsonb_typeof(deck)='array' AND jsonb_array_length(deck)=52),
 PRIMARY KEY(child_id,round));
ALTER TABLE private.delayed_take_two_deals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_take_two_deals FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='private.delayed_take_two_deals'::regclass AND tgname='delayed_take_two_deals_immutable') THEN
  CREATE TRIGGER delayed_take_two_deals_immutable BEFORE UPDATE OR DELETE ON private.delayed_take_two_deals FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
 END IF;
END $$;
ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check;
ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two'));

-- Same-deal reviews are embargoed until the viewer finishes that exact round.
-- Terminal forfeits also unlock saved history, since no more play is possible.
CREATE OR REPLACE FUNCTION private.delayed_take_two_review_allowed(e private.delayed_review_events,who uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.game_type<>'take-two' OR c.terminal OR e.kind='child' OR e.actor=who OR EXISTS(
  SELECT FROM private.delayed_review_events own WHERE own.child_id=e.child_id AND own.actor=who AND own.kind='attempt' AND own.round=e.round)
 FROM private.delayed_children c WHERE c.id=e.child_id
$$;
REVOKE ALL ON FUNCTION private.delayed_take_two_review_allowed(private.delayed_review_events,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.take_two_board_from_deck(b jsonb, at_ms bigint, deck jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE layout jsonb;size_i integer;start_i bigint;
BEGIN
 IF jsonb_typeof(deck) IS DISTINCT FROM 'array' OR jsonb_array_length(deck)<>52
 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(deck))<>52
 OR EXISTS(SELECT FROM jsonb_array_elements(deck) x WHERE jsonb_typeof(x)<>'number' OR x::text !~ '^[0-9]+$' OR (x::text)::integer NOT BETWEEN 0 AND 51)
 THEN RAISE EXCEPTION 'take_two:invalid_deck';END IF;
 IF private.take_two_rules(b#>>'{rules,version}') IS NULL OR b->'rules' IS DISTINCT FROM private.take_two_rules(b#>>'{rules,version}') THEN RAISE EXCEPTION 'take_two:rules';END IF;
 layout:=private.take_two_layout(coalesce((b->>'stage')::integer,1));size_i:=jsonb_array_length(layout);
 start_i:=at_ms+(b#>>'{rules,introMs}')::integer;
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'layout',layout,
 'slots',(SELECT jsonb_agg(deck->i ORDER BY i) FROM generate_series(0,size_i-1)i),'cursor',size_i+1,'current',deck->size_i,
 'scoreBefore',coalesce(b->'score','0'::jsonb),'score',coalesce(b->'score','0'::jsonb),'samePairs',0,'consecutivePairs',0,
 'meterAt',start_i,'phase','intro','deadline',start_i,'result',NULL,'event',jsonb_build_object('label','Get ready','points',0));
END $function$
;
REVOKE ALL ON FUNCTION private.take_two_board_from_deck(jsonb,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('private.take_two_board_deal(jsonb,bigint)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION private.take_two_board_deal(b jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE deck jsonb:=private.take_two_shuffle();layout jsonb;size_i integer;start_i bigint;
BEGIN
 IF private.take_two_rules(b#>>'{rules,version}') IS NULL OR b->'rules' IS DISTINCT FROM private.take_two_rules(b#>>'{rules,version}') THEN RAISE EXCEPTION 'take_two:rules';END IF;
 layout:=private.take_two_layout(coalesce((b->>'stage')::integer,1));size_i:=jsonb_array_length(layout);
 start_i:=at_ms+(b#>>'{rules,introMs}')::integer;
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'layout',layout,
 'slots',(SELECT jsonb_agg(deck->i ORDER BY i) FROM generate_series(0,size_i-1)i),'cursor',size_i+1,'current',deck->size_i,
 'scoreBefore',coalesce(b->'score','0'::jsonb),'score',coalesce(b->'score','0'::jsonb),'samePairs',0,'consecutivePairs',0,
 'meterAt',start_i,'phase','intro','deadline',start_i,'result',NULL,'event',jsonb_build_object('label','Get ready','points',0));
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION private.take_two_board_deal(b jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.take_two_board_from_deck(b,at_ms,private.take_two_shuffle());
END $function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION private.take_two_board_deal(b jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.take_two_board_from_deck(b,at_ms,private.take_two_shuffle());
END $function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed take_two_board_deal';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
  IF coalesce(item->>'game','') NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (item-ARRAY['game','stake','config'])<>'{}'::jsonb OR jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();
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
END $function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
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
END $function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_create';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_respond(uuid,uuid,text,text)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
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
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
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
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='take-two')
   AND NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   IF c.game_type='take-two' THEN
    INSERT INTO private.delayed_take_two_deals(child_id,round,deck)
    SELECT c.id,r,private.take_two_shuffle() FROM generate_series(1,3) r;
   END IF;
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
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
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
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='take-two')
   AND NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   IF c.game_type='take-two' THEN
    INSERT INTO private.delayed_take_two_deals(child_id,round,deck)
    SELECT c.id,r,private.take_two_shuffle() FROM generate_series(1,3) r;
   END IF;
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
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_respond';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_load(uuid,uuid,uuid)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind='attempt'),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind='attempt'),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind='attempt'),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_load';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_commit(p_child uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_event text, p_at bigint, p_advanced boolean, p_request uuid DEFAULT NULL::uuid, p_fingerprint jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_actor IS NOT NULL AND p_request IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
  END IF;
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.terminal THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c)); END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 now_i:=clock_timestamp();event_time:=to_timestamp(p_at/1000.0);
 expected_due:=least(c.expires_at,c.gameplay_due_at);
 IF p_event='action' THEN
  IF p_actor IS DISTINCT FROM c.actor OR p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:not_your_turn';END IF;
  IF now_i>=expected_due THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c)); END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<expected_due OR abs(extract(epoch FROM expected_due)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick'; END IF;
  IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) THEN
   PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF event_time>now_i OR event_time<c.available_at-interval '1 millisecond' OR p_state->>'version' IS DISTINCT FROM 'delayed/1'
  OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 done:=coalesce((p_state->>'completed')::boolean,false);
 next_actor:=(p_state->'players'->>(p_state->>'turn')::integer)::uuid;
 IF next_actor IS NULL OR next_actor NOT IN(m.organizer,m.opponent) OR (NOT p_advanced AND next_actor<>c.actor) OR (done AND NOT p_advanced)
 THEN RAISE EXCEPTION 'delayed:invalid_actor';END IF;
 next_due:=(p_state#>>'{board,deadline}')::bigint;
 UPDATE private.delayed_children SET state=p_state,revision=revision+1,
  actor=next_actor,segment=segment+CASE WHEN p_advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN p_advanced THEN event_time ELSE available_at END,
  last_call_at=CASE WHEN p_advanced THEN event_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN p_advanced THEN event_time+interval '36 hours' ELSE expires_at END,
  started_at=to_timestamp((p_state->>'segmentStartedAt')::bigint/1000.0),gameplay_due_at=to_timestamp(next_due/1000.0)
 WHERE id=c.id RETURNING * INTO c;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_state->>'winner' IS NULL THEN 'draw' ELSE 'normal' END,
   (p_state->>'winner')::uuid,jsonb_build_object('rules',c.config,'finalState',p_state));
 ELSE
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_commit(p_child uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_event text, p_at bigint, p_advanced boolean, p_request uuid DEFAULT NULL::uuid, p_fingerprint jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_actor IS NOT NULL AND p_request IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
  END IF;
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.terminal THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c)); END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 now_i:=clock_timestamp();event_time:=to_timestamp(p_at/1000.0);
 expected_due:=least(c.expires_at,c.gameplay_due_at);
 IF p_event='action' THEN
  IF p_actor IS DISTINCT FROM c.actor OR p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:not_your_turn';END IF;
  IF now_i>=expected_due THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c)); END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<expected_due OR abs(extract(epoch FROM expected_due)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick'; END IF;
  IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) THEN
   PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF event_time>now_i OR event_time<c.available_at-interval '1 millisecond' OR p_state->>'version' IS DISTINCT FROM 'delayed/1'
  OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 done:=coalesce((p_state->>'completed')::boolean,false);
 next_actor:=(p_state->'players'->>(p_state->>'turn')::integer)::uuid;
 IF next_actor IS NULL OR next_actor NOT IN(m.organizer,m.opponent) OR (NOT p_advanced AND next_actor<>c.actor) OR (done AND NOT p_advanced)
 THEN RAISE EXCEPTION 'delayed:invalid_actor';END IF;
 next_due:=(p_state#>>'{board,deadline}')::bigint;
 UPDATE private.delayed_children SET state=p_state,revision=revision+1,
  actor=next_actor,segment=segment+CASE WHEN p_advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN p_advanced THEN event_time ELSE available_at END,
  last_call_at=CASE WHEN p_advanced THEN event_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN p_advanced THEN event_time+interval '36 hours' ELSE expires_at END,
  started_at=to_timestamp((p_state->>'segmentStartedAt')::bigint/1000.0),gameplay_due_at=to_timestamp(next_due/1000.0)
 WHERE id=c.id RETURNING * INTO c;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_state->>'winner' IS NULL THEN 'draw' ELSE 'normal' END,
   (p_state->>'winner')::uuid,jsonb_build_object('rules',c.config,'finalState',p_state));
 ELSE
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_commit(p_child uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_event text, p_at bigint, p_advanced boolean, p_request uuid DEFAULT NULL::uuid, p_fingerprint jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_actor IS NOT NULL AND p_request IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
  END IF;
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.terminal THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c)); END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 now_i:=clock_timestamp();event_time:=to_timestamp(p_at/1000.0);
 expected_due:=least(c.expires_at,c.gameplay_due_at);
 IF p_event='action' THEN
  IF p_actor IS DISTINCT FROM c.actor OR p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:not_your_turn';END IF;
  IF now_i>=expected_due THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c)); END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<expected_due OR abs(extract(epoch FROM expected_due)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick'; END IF;
  IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) THEN
   PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF event_time>now_i OR event_time<c.available_at-interval '1 millisecond' OR p_state->>'version' IS DISTINCT FROM 'delayed/1'
  OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 done:=coalesce((p_state->>'completed')::boolean,false);
 next_actor:=(p_state->'players'->>(p_state->>'turn')::integer)::uuid;
 IF next_actor IS NULL OR next_actor NOT IN(m.organizer,m.opponent) OR (NOT p_advanced AND next_actor<>c.actor) OR (done AND NOT p_advanced)
 THEN RAISE EXCEPTION 'delayed:invalid_actor';END IF;
 next_due:=(p_state#>>'{board,deadline}')::bigint;
 UPDATE private.delayed_children SET state=p_state,revision=revision+1,
  actor=next_actor,segment=segment+CASE WHEN p_advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN p_advanced THEN event_time ELSE available_at END,
  last_call_at=CASE WHEN p_advanced THEN event_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN p_advanced THEN event_time+interval '36 hours' ELSE expires_at END,
  started_at=to_timestamp((p_state->>'segmentStartedAt')::bigint/1000.0),gameplay_due_at=to_timestamp(next_due/1000.0)
 WHERE id=c.id RETURNING * INTO c;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_state->>'winner' IS NULL THEN 'draw' ELSE 'normal' END,
   (p_state->>'winner')::uuid,jsonb_build_object('rules',c.config,'finalState',p_state));
 ELSE
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_commit';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_capabilities()'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_capabilities()
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
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules()))||CASE WHEN (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR (private.mega_test_actor(auth.uid()) AND EXISTS(SELECT FROM private.mega_test_async WHERE actor=auth.uid() AND expires_at>statement_timestamp() AND match_id IS NULL)) THEN jsonb_build_array(jsonb_build_object('id','mega-card-golf','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='mega-card-golf'),'rules',private.mega_competition_config(),'courses',private.mega_competition_courses())) ELSE '[]'::jsonb END END) WHERE auth.uid() IS NOT NULL
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
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules()))||CASE WHEN (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR (private.mega_test_actor(auth.uid()) AND EXISTS(SELECT FROM private.mega_test_async WHERE actor=auth.uid() AND expires_at>statement_timestamp() AND match_id IS NULL)) THEN jsonb_build_array(jsonb_build_object('id','mega-card-golf','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='mega-card-golf'),'rules',private.mega_competition_config(),'courses',private.mega_competition_courses())) ELSE '[]'::jsonb END
 ||CASE WHEN (SELECT enabled FROM private.delayed_take_two_release WHERE singleton)
 THEN jsonb_build_array(jsonb_build_object('id','take-two','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='take-two'),'rules',private.take_two_rules('take-two/2')))
 ELSE '[]'::jsonb END END) WHERE auth.uid() IS NOT NULL
$function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_capabilities()
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
$function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_capabilities';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('private.delayed_review_board(text,jsonb)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION private.delayed_review_board(game text, b jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE game WHEN 'run21' THEN (SELECT jsonb_object_agg(key,value) FROM jsonb_each(b) WHERE key=ANY(ARRAY['playerId','columns','passesUsed','presented','current','cardIndex','revision','startedAt','deadline','result']))
 WHEN 'tri-towers' THEN private.tri_towers_visible(b)
 WHEN 'quintzee' THEN private.quintzee_present_board(b)
 WHEN 'boxdrop' THEN private.boxdrop_visible(b)
 WHEN 'mega-card-golf' THEN b-ARRAY['decks','owner']||jsonb_build_object('serverAt',0,'dueAt',(b->>'deadline')::bigint,'stockRemaining',(b#>>'{config,stockAllowance}')::int-(b->>'draws')::int,'discardsRemaining',(b#>>'{config,discardAllowance}')::int-(b->>'discards')::int)
 WHEN 'ptown-words' THEN private.ptown_words_visible(b,NULL)-ARRAY['rack','rackCounts'] END
$function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION private.delayed_review_board(game text, b jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE game WHEN 'run21' THEN (SELECT jsonb_object_agg(key,value) FROM jsonb_each(b) WHERE key=ANY(ARRAY['playerId','columns','passesUsed','presented','current','cardIndex','revision','startedAt','deadline','result']))
 WHEN 'tri-towers' THEN private.tri_towers_visible(b)
 WHEN 'quintzee' THEN private.quintzee_present_board(b)
 WHEN 'boxdrop' THEN private.boxdrop_visible(b)
 WHEN 'mega-card-golf' THEN b-ARRAY['decks','owner']||jsonb_build_object('serverAt',0,'dueAt',(b->>'deadline')::bigint,'stockRemaining',(b#>>'{config,stockAllowance}')::int-(b->>'draws')::int,'discardsRemaining',(b#>>'{config,discardAllowance}')::int-(b->>'discards')::int)
 WHEN 'take-two' THEN private.take_two_visible(b)
 WHEN 'ptown-words' THEN private.ptown_words_visible(b,NULL)-ARRAY['rack','rackCounts'] END
$function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION private.delayed_review_board(game text, b jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE game WHEN 'run21' THEN (SELECT jsonb_object_agg(key,value) FROM jsonb_each(b) WHERE key=ANY(ARRAY['playerId','columns','passesUsed','presented','current','cardIndex','revision','startedAt','deadline','result']))
 WHEN 'tri-towers' THEN private.tri_towers_visible(b)
 WHEN 'quintzee' THEN private.quintzee_present_board(b)
 WHEN 'boxdrop' THEN private.boxdrop_visible(b)
 WHEN 'mega-card-golf' THEN b-ARRAY['decks','owner']||jsonb_build_object('serverAt',0,'dueAt',(b->>'deadline')::bigint,'stockRemaining',(b#>>'{config,stockAllowance}')::int-(b->>'draws')::int,'discardsRemaining',(b#>>'{config,discardAllowance}')::int-(b->>'discards')::int)
 WHEN 'take-two' THEN private.take_two_visible(b)
 WHEN 'ptown-words' THEN private.ptown_words_visible(b,NULL)-ARRAY['rack','rackCounts'] END
$function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_review_board';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_reviews(uuid)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_reviews(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();answer jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id AND who IN(organizer,opponent);
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'actor',e.actor,'round',e.round,'score',e.score,
  'at',e.completed_at,'receipt',e.receipt,'actorName',(SELECT username FROM public.profiles WHERE id=e.actor),'board',b.board,'seen',EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)) ORDER BY e.completed_at,e.kind DESC),'[]') INTO answer
 FROM private.delayed_review_events e LEFT JOIN private.delayed_review_boards b ON b.event_id=e.id WHERE e.child_id=c.id AND (e.actor IS DISTINCT FROM who OR e.kind='child');
 RETURN jsonb_build_object('events',answer,'terminal',c.terminal,'actor',c.actor,'segment',c.segment,'revision',c.revision,'started',c.started_at IS NOT NULL,'expiresAt',c.expires_at,'held',private.delayed_held(m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_reviews(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();answer jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id AND who IN(organizer,opponent);
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'actor',e.actor,'round',e.round,'score',e.score,
  'at',e.completed_at,'receipt',e.receipt,'actorName',(SELECT username FROM public.profiles WHERE id=e.actor),'board',b.board,'seen',EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)) ORDER BY e.completed_at,e.kind DESC),'[]') INTO answer
 FROM private.delayed_review_events e LEFT JOIN private.delayed_review_boards b ON b.event_id=e.id WHERE e.child_id=c.id AND (e.actor IS DISTINCT FROM who OR e.kind='child') AND private.delayed_take_two_review_allowed(e,who);
 RETURN jsonb_build_object('events',answer,'terminal',c.terminal,'actor',c.actor,'segment',c.segment,'revision',c.revision,'started',c.started_at IS NOT NULL,'expiresAt',c.expires_at,'held',private.delayed_held(m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_reviews(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();answer jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id AND who IN(organizer,opponent);
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'actor',e.actor,'round',e.round,'score',e.score,
  'at',e.completed_at,'receipt',e.receipt,'actorName',(SELECT username FROM public.profiles WHERE id=e.actor),'board',b.board,'seen',EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)) ORDER BY e.completed_at,e.kind DESC),'[]') INTO answer
 FROM private.delayed_review_events e LEFT JOIN private.delayed_review_boards b ON b.event_id=e.id WHERE e.child_id=c.id AND (e.actor IS DISTINCT FROM who OR e.kind='child') AND private.delayed_take_two_review_allowed(e,who);
 RETURN jsonb_build_object('events',answer,'terminal',c.terminal,'actor',c.actor,'segment',c.segment,'revision',c.revision,'started',c.started_at IS NOT NULL,'expiresAt',c.expires_at,'held',private.delayed_held(m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_reviews';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_review_begin(uuid)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_review_begin(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;who uuid:=auth.uid();started timestamptz;
BEGIN
 SELECT * INTO e FROM private.delayed_review_events WHERE id=p_event;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent)) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id)
 THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE id=e.match_id FOR UPDATE;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_playback(event_id,viewer) VALUES(e.id,who)
 ON CONFLICT(event_id,viewer) DO UPDATE SET lease_until=clock_timestamp()+interval '5 minutes'
 RETURNING started_at INTO started;
 RETURN jsonb_build_object('elapsed',greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000)),'seen',EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=e.id AND viewer=who));
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_review_begin(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;who uuid:=auth.uid();started timestamptz;
BEGIN
 SELECT * INTO e FROM private.delayed_review_events WHERE id=p_event;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent)) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id)
 THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE id=e.match_id FOR UPDATE;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 IF NOT private.delayed_take_two_review_allowed(e,who) THEN RAISE EXCEPTION 'delayed:review_unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_playback(event_id,viewer) VALUES(e.id,who)
 ON CONFLICT(event_id,viewer) DO UPDATE SET lease_until=clock_timestamp()+interval '5 minutes'
 RETURNING started_at INTO started;
 RETURN jsonb_build_object('elapsed',greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000)),'seen',EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=e.id AND viewer=who));
END $function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_review_begin(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;who uuid:=auth.uid();started timestamptz;
BEGIN
 SELECT * INTO e FROM private.delayed_review_events WHERE id=p_event;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent)) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id)
 THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE id=e.match_id FOR UPDATE;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 IF NOT private.delayed_take_two_review_allowed(e,who) THEN RAISE EXCEPTION 'delayed:review_unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_playback(event_id,viewer) VALUES(e.id,who)
 ON CONFLICT(event_id,viewer) DO UPDATE SET lease_until=clock_timestamp()+interval '5 minutes'
 RETURNING started_at INTO started;
 RETURN jsonb_build_object('elapsed',greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000)),'seen',EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=e.id AND viewer=who));
END $function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_review_begin';END IF;
END $patch$;
DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('delayed_review_ack(uuid)'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$CREATE OR REPLACE FUNCTION public.delayed_review_ack(p_event uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO STRICT e FROM private.delayed_review_events WHERE id=p_event;
 SELECT * INTO m FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent) FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_seen(event_id,viewer) VALUES(e.id,who) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$
$before$ THEN EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_review_ack(p_event uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO STRICT e FROM private.delayed_review_events WHERE id=p_event;
 SELECT * INTO m FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent) FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 IF NOT private.delayed_take_two_review_allowed(e,who) THEN RAISE EXCEPTION 'delayed:review_unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_seen(event_id,viewer) VALUES(e.id,who) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$
$after$;
 ELSIF current_source<>$after$CREATE OR REPLACE FUNCTION public.delayed_review_ack(p_event uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO STRICT e FROM private.delayed_review_events WHERE id=p_event;
 SELECT * INTO m FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent) FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 IF NOT private.delayed_take_two_review_allowed(e,who) THEN RAISE EXCEPTION 'delayed:review_unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_seen(event_id,viewer) VALUES(e.id,who) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$
$after$ THEN RAISE EXCEPTION 'take_two:source_changed delayed_review_ack';END IF;
END $patch$;
-- Only the authenticated server adapter can load persisted challenges or reduce boards.
CREATE OR REPLACE FUNCTION public.delayed_take_two_core(
 p_child uuid,p_operation text,p_round integer DEFAULT NULL,p_score bigint DEFAULT 0,
 p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,p_at bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;deck_i jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 IF c.game_type<>'take-two' OR c.config IS DISTINCT FROM private.take_two_rules('take-two/2') THEN RAISE EXCEPTION 'take_two:child';END IF;
 CASE p_operation
 WHEN 'deal' THEN
  SELECT deck INTO STRICT deck_i FROM private.delayed_take_two_deals WHERE child_id=c.id AND round=p_round;
  RETURN private.take_two_board_from_deck(jsonb_build_object('rules',c.config,'stage',p_round,'score',p_score,'highScore',0),p_at,deck_i);
 WHEN 'reduce' THEN
  IF p_board->'rules' IS DISTINCT FROM c.config THEN RAISE EXCEPTION 'take_two:rules';END IF;
  RETURN private.take_two_board_reduce(p_board,p_action,p_items,p_at);
 WHEN 'visible' THEN RETURN private.take_two_visible(p_board)-'activePlayerId';
 ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';END CASE;
END $$;
REVOKE ALL ON FUNCTION public.delayed_take_two_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_take_two_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint) TO service_role;
