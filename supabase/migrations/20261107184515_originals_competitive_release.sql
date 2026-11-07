DO $originals_install$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('originals-competition/1'));
 IF to_regclass('private.originals_release') IS NOT NULL THEN
  IF to_regprocedure('public.originals_live_action(uuid,uuid,bigint,jsonb)') IS NULL OR to_regprocedure('public.delayed_originals_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint,integer)') IS NULL THEN RAISE EXCEPTION 'originals:partial_installation';END IF;
  RETURN;
 END IF;
 EXECUTE $originals_body$
-- Both competitive modes call the installed Arcade gameplay rules.
CREATE TABLE private.originals_release(
 game text PRIMARY KEY CHECK(game IN('crib-lab','chucky-showdown')),
 live_enabled boolean NOT NULL DEFAULT false,
 async_enabled boolean NOT NULL DEFAULT false,
 live_real_qualified boolean NOT NULL DEFAULT false,
 async_real_qualified boolean NOT NULL DEFAULT false
);
INSERT INTO private.originals_release(game) VALUES('crib-lab'),('chucky-showdown');
ALTER TABLE private.originals_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.originals_release FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.originals_config(game_i text, shared_deck boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r private.arcade_rulesets;
BEGIN
 SELECT * INTO STRICT r FROM private.arcade_rulesets WHERE game=game_i AND enabled;
 IF r.config->>'version' IS DISTINCT FROM (CASE WHEN game_i='chucky-showdown' THEN 'chucky-showdown/3' ELSE 'crib-lab/2' END) OR (shared_deck AND game_i<>'crib-lab') THEN
  RAISE EXCEPTION 'originals:rules_unavailable';
 END IF;
 RETURN jsonb_build_object('game',game_i,'ruleset',r.id,'gameplay',r.config,'rounds',3,'sharedDeck',shared_deck);
END $$;

-- The optional private deal is consumed by the existing dealing owner.
-- Its hands/stock/cut mapping and all scoring/timing remain in that owner.
DO $deal$
DECLARE definition text:=pg_get_functiondef('private.crib_lab_deal_v1(jsonb,integer,bigint)'::regprocedure);
BEGIN
 IF md5(definition)<>'d1453ce0c6bd0a217dae9e939bf68a51'
 OR position('deck jsonb:=private.cribbage_new_deck();' IN definition)=0
 OR position('RETURN s||jsonb_build_object(' IN definition)=0 THEN RAISE EXCEPTION 'originals:deal_owner_changed';END IF;
 definition:=replace(definition,'deck jsonb:=private.cribbage_new_deck();','deck jsonb:=coalesce(s->''_competitiveDeck'',private.cribbage_new_deck());');
 definition:=replace(definition,'RETURN s||jsonb_build_object(','RETURN (s-''_competitiveDeck'')||jsonb_build_object(');
 EXECUTE definition;
END $deal$;

CREATE FUNCTION private.originals_board(game_i text, operation text, cfg jsonb, round_i integer,
 score_before bigint, b jsonb, at_ms bigint, action_i text DEFAULT NULL,
 items integer[] DEFAULT NULL, level_i integer DEFAULT NULL, deck_i jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE s jsonb:=b; actual_phase text; due bigint; result_i jsonb;
BEGIN
 IF game_i NOT IN('crib-lab','chucky-showdown') OR cfg->>'game' IS DISTINCT FROM game_i
 OR NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE game=game_i AND id=cfg->>'ruleset' AND config=cfg->'gameplay')
 THEN RAISE EXCEPTION 'originals:frozen_rules';END IF;
 IF operation='deal' THEN
  IF round_i NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'originals:round';END IF;
  s:=jsonb_build_object('runId',gen_random_uuid(),'status','active','config',cfg->'gameplay',
    'round',round_i-1,'hand',0,'score',score_before,'results','[]'::jsonb);
  IF game_i='crib-lab' THEN
   IF deck_i IS NOT NULL THEN
    IF jsonb_array_length(deck_i)<>52 OR (SELECT count(DISTINCT (value->>'rank',value->>'suit')) FROM jsonb_array_elements(deck_i)
      WHERE value->>'rank' IN('A','2','3','4','5','6','7','8','9','10','J','Q','K') AND value->>'suit' IN('hearts','diamonds','clubs','spades'))<>52
    THEN RAISE EXCEPTION 'originals:deck';END IF;
    s:=s||jsonb_build_object('_competitiveDeck',deck_i);
   END IF;
   s:=private.crib_lab_deal(s,round_i,at_ms);
  ELSE s:=private.chucky_showdown_deal_v2(s,true,at_ms);
  END IF;
 ELSIF operation='reduce' THEN
  IF b->'config' IS DISTINCT FROM cfg->'gameplay' OR b->>'phase'='stage_complete' THEN RAISE EXCEPTION 'originals:board';END IF;
  IF action_i='abandon' THEN RAISE EXCEPTION 'originals:use_competitive_forfeit';END IF;
  IF game_i='crib-lab' THEN
   IF action_i='tick' THEN s:=private.crib_lab_advance(s,at_ms);
   ELSE s:=private.crib_lab_action(s,action_i,coalesce(items,'{}'),at_ms);END IF;
  ELSE
   IF action_i='tick' THEN s:=private.chucky_showdown_advance_v2(s,at_ms);
   ELSE s:=private.chucky_showdown_act_v2(s,action_i,level_i,at_ms);END IF;
  END IF;
 ELSE RAISE EXCEPTION 'originals:operation';END IF;
 actual_phase:=s->>'phase';
 due:=CASE WHEN game_i='crib-lab' THEN coalesce((s->>'phaseUntil')::bigint,(s->>'deadline')::bigint) ELSE (s->>'due')::bigint END;
 IF actual_phase IN('scoring','round_over') THEN
  result_i:=s->'results'->-1;
  s:=s||jsonb_build_object('gamePhase',actual_phase,'phase','stage_complete','result',result_i);
 END IF;
 -- Scheduling metadata uses a separate key so Crib Lab's time-bonus clock survives.
 RETURN s||jsonb_build_object('nextDue',due);
END $$;

CREATE FUNCTION private.originals_visible(game_i text, b jsonb, at_ms bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE phase_i text:=coalesce(b->>'gamePhase',b->>'phase'); answer jsonb;
BEGIN
 IF b IS NULL OR b='null'::jsonb THEN RETURN NULL;END IF;
 IF game_i='crib-lab' THEN
  answer:=jsonb_build_object('round',b->'round','roundId',b->'roundId','phase',phase_i,'hands',b->'hands',
   'score',b->'score','discardMasks',b->'discardMasks','stockLeft',5-(b->>'stockIndex')::int,
   'swapsLeft',b->'swapsLeft','offer',CASE WHEN phase_i='stock' THEN b->'stock'->((b->>'stockIndex')::int) END,
   'cut',CASE WHEN phase_i IN('cut','swap','scoring') THEN b->'cut' END,
   'durationMs',b#>'{config,durationMs}','deadline',b->'deadline','phaseUntil',b->'phaseUntil',
   'transition',b->'transition','result',CASE WHEN phase_i='scoring' THEN b->'results'->-1 END);
 ELSIF game_i='chucky-showdown' THEN
  answer:=private.chucky_showdown_scene_v2(b||jsonb_build_object('phase',phase_i))||
   jsonb_build_object('config',b->'config','lastShowdown',b->'lastShowdown','lastRound',b->'lastRound','lastFold',b->'lastFold','result',b->'result');
 ELSE RAISE EXCEPTION 'originals:game';END IF;
 RETURN answer||jsonb_build_object('serverAt',at_ms,'status',CASE WHEN b->>'phase'='stage_complete' THEN 'completed' ELSE 'active' END,'completion',NULL);
END $$;
REVOKE ALL ON FUNCTION private.originals_config(text,boolean),
 private.originals_board(text,text,jsonb,integer,bigint,jsonb,bigint,text,integer[],integer,jsonb),
 private.originals_visible(text,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.originals_async_decks(
 child_id uuid REFERENCES private.delayed_children(id), round integer CHECK(round BETWEEN 1 AND 3),
 deck jsonb NOT NULL, PRIMARY KEY(child_id,round)
);
ALTER TABLE private.originals_async_decks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.originals_async_decks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_originals_core(p_child uuid,p_operation text,p_round integer DEFAULT NULL,
 p_score bigint DEFAULT 0,p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,
 p_at bigint DEFAULT NULL,p_level integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children; deck_i jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 IF c.game_type NOT IN('crib-lab','chucky-showdown') THEN RAISE EXCEPTION 'originals:child';END IF;
 IF p_operation='visible' THEN RETURN private.originals_visible(c.game_type,p_board,p_at);END IF;
 IF p_operation='deal' AND c.game_type='crib-lab' AND (c.config->>'sharedDeck')::boolean THEN
  INSERT INTO private.originals_async_decks VALUES(c.id,p_round,private.cribbage_new_deck()) ON CONFLICT DO NOTHING;
  SELECT deck INTO STRICT deck_i FROM private.originals_async_decks WHERE child_id=c.id AND round=p_round;
 END IF;
 RETURN private.originals_board(c.game_type,p_operation,c.config,p_round,p_score,p_board,p_at,p_action,p_items,p_level,deck_i);
END $$;
REVOKE ALL ON FUNCTION public.delayed_originals_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_originals_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint,integer) TO service_role;

ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check;
ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown'));

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure)) IS DISTINCT FROM '79a336ee69a663ca4229bf0424de9b69' THEN RAISE EXCEPTION 'originals:owner_changed:delayed_create';END IF;END $guard$;
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
  IF coalesce(item->>'game','') NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (item-ARRAY['game','stake','config'])<>'{}'::jsonb OR jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/2');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();
  WHEN 'crib-lab','chucky-showdown' THEN
   IF NOT EXISTS(SELECT FROM private.originals_release WHERE game=item->>'game' AND async_enabled AND (NOT p_real_money OR async_real_qualified)) THEN RAISE EXCEPTION 'originals:async_closed';END IF;
   cfg:=private.originals_config(item->>'game',CASE WHEN item->>'game'='crib-lab' THEN coalesce((item#>>'{config,sharedDeck}')::boolean,true) ELSE false END);
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
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_respond(uuid,uuid,text,text)'::regprocedure)) IS DISTINCT FROM '360309df9afd0880f9980ce5134e3611' THEN RAISE EXCEPTION 'originals:owner_changed:delayed_respond';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
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
 IF p_action='cancel' THEN
  PERFORM private.delayed_delete_pending_invitation(m.id);
  response:=jsonb_build_object('status','cancelled','deleted',true);
  INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
  RETURN response;
 END IF;
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
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   IF c.game_type IN('crib-lab','chucky-showdown') AND NOT EXISTS(SELECT FROM private.originals_release WHERE game=c.game_type AND async_enabled AND (NOT m.real_money OR async_real_qualified)) THEN RAISE EXCEPTION 'originals:async_closed';END IF;
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
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_load(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'a95fe7e12d65d085916697fe25ea0797' THEN RAISE EXCEPTION 'originals:owner_changed:delayed_load';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
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
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind='attempt'),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb)'::regprocedure)) IS DISTINCT FROM 'eb767f93e9ce5301f0ad5066056261d2' THEN RAISE EXCEPTION 'originals:owner_changed:delayed_commit';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_commit(p_child uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_event text, p_at bigint, p_advanced boolean, p_request uuid DEFAULT NULL::uuid, p_fingerprint jsonb DEFAULT NULL::jsonb)
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
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
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
 next_due:=CASE WHEN c.game_type IN('crib-lab','chucky-showdown') THEN (p_state#>>'{board,nextDue}')::bigint ELSE (p_state#>>'{board,deadline}')::bigint END;
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
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_capabilities()'::regprocedure)) IS DISTINCT FROM 'dea264bc4f771e3366884cdb73d1f651' THEN RAISE EXCEPTION 'originals:owner_changed:delayed_capabilities';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',NOT coalesce((SELECT real_qualified FROM private.delayed_release WHERE singleton),false),'max_children',CASE WHEN private.delayed_multi_enabled() THEN 32 ELSE 1 END,'games',CASE WHEN NOT private.delayed_multi_enabled() THEN jsonb_build_array(jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/2'))) ELSE jsonb_build_array(
 jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/2')),
 jsonb_build_object('id','run21','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='run21'),'rules',(SELECT config FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21')),
 jsonb_build_object('id','tri-towers','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='tri-towers'),'rules',private.tri_towers_rules()),
 jsonb_build_object('id','quintzee','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='quintzee'),'rules',private.quintzee_default_rules()),
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules()))||CASE WHEN (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR (private.mega_test_actor(auth.uid()) AND EXISTS(SELECT FROM private.mega_test_async WHERE actor=auth.uid() AND expires_at>statement_timestamp() AND match_id IS NULL)) THEN jsonb_build_array(jsonb_build_object('id','mega-card-golf','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='mega-card-golf'),'rules',private.mega_competition_config(),'courses',private.mega_competition_courses())) ELSE '[]'::jsonb END
 ||CASE WHEN (SELECT enabled FROM private.delayed_take_two_release WHERE singleton)
 THEN jsonb_build_array(jsonb_build_object('id','take-two','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='take-two'),'rules',private.take_two_rules('take-two/2')))
 ELSE '[]'::jsonb END ||coalesce((SELECT jsonb_agg(jsonb_build_object('id',game,'stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type=r.game),'rules',private.originals_config(game,game='crib-lab'),'realQualified',async_real_qualified)) FROM private.originals_release r WHERE async_enabled),'[]'::jsonb) END) WHERE auth.uid() IS NOT NULL
$function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_home(uuid)'::regprocedure)) IS DISTINCT FROM 'bc857d63d176351be953362dc1cd8528' THEN RAISE EXCEPTION 'originals:owner_changed:delayed_home';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=p_match)
  AND EXISTS(SELECT FROM public.delayed_match_updates WHERE match_id=p_match AND user_id=who) THEN
  RAISE EXCEPTION 'delayed:invitation_cancelled' USING ERRCODE='P0002';
 END IF;
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  item:=item||jsonb_build_object('playable',
   h->>'status'='active' AND NOT (h->>'held')::boolean AND NOT c.terminal AND c.actor=who
   AND least(c.expires_at,c.gameplay_due_at)>statement_timestamp(),
   'playableDeadline',least(c.expires_at,c.gameplay_due_at));
  -- Existing lobby ordering, presence and resume links use the current actionable deadline.
  IF c.game_type='ptown-words' AND c.config->>'version'='ptown-words/2' AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type='ptown-words' THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'crib-lab' THEN 3 WHEN 'chucky-showdown' THEN 3
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('private.delayed_review_board(text,jsonb)'::regprocedure)) IS DISTINCT FROM 'b7222f1239463d18671ce49f58f1d2a9' THEN RAISE EXCEPTION 'originals:owner_changed:private.delayed_review_board';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.delayed_review_board(game text, b jsonb)
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
 WHEN 'crib-lab' THEN private.originals_visible(game,b)
 WHEN 'chucky-showdown' THEN private.originals_visible(game,b)
 WHEN 'take-two' THEN private.take_two_visible(b)
 WHEN 'ptown-words' THEN private.ptown_words_visible(b,NULL)-ARRAY['rack','rackCounts'] END
$function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('private.delayed_take_two_review_allowed(private.delayed_review_events,uuid)'::regprocedure)) IS DISTINCT FROM '9de56545ad1f624451635472650943c8' THEN RAISE EXCEPTION 'originals:owner_changed:private.delayed_take_two_review_allowed';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.delayed_take_two_review_allowed(e private.delayed_review_events, who uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT (c.game_type<>'take-two' AND (c.game_type<>'crib-lab' OR NOT (c.config->>'sharedDeck')::boolean)) OR c.terminal OR e.kind='child' OR e.actor=who OR EXISTS(
  SELECT FROM private.delayed_review_events own WHERE own.child_id=e.child_id AND own.actor=who AND own.kind='attempt' AND own.round=e.round)
 FROM private.delayed_children c WHERE c.id=e.child_id
$function$
;

CREATE TABLE private.originals_live_matches(
 dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),game_id uuid NOT NULL REFERENCES public.games(id),round_id uuid NOT NULL REFERENCES public.rounds(id),
 state jsonb NOT NULL,revision bigint NOT NULL DEFAULT 0,stake integer NOT NULL CHECK(stake BETWEEN 1 AND 9999),
 settlement jsonb,finished boolean NOT NULL DEFAULT false,paused_at bigint,player_controls jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX originals_live_due ON private.originals_live_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND paused_at IS NULL;
CREATE TABLE private.originals_live_requests(dealer_game_id uuid NOT NULL REFERENCES private.originals_live_matches(dealer_game_id),request_id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(dealer_game_id,request_id));
ALTER TABLE private.originals_live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.originals_live_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.originals_live_matches,private.originals_live_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.originals_live_revisions(dealer_game_id uuid PRIMARY KEY REFERENCES private.originals_live_matches(dealer_game_id),game_id uuid NOT NULL,revision bigint NOT NULL);
ALTER TABLE public.originals_live_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.originals_live_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.originals_live_revisions TO authenticated;
CREATE POLICY originals_live_members ON public.originals_live_revisions FOR SELECT TO authenticated USING(EXISTS(SELECT FROM public.players WHERE game_id=originals_live_revisions.game_id AND user_id=(SELECT auth.uid()) AND status<>'left'));
DO $$BEGIN IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.originals_live_revisions;END IF;END $$;

CREATE FUNCTION private.originals_live_actor_allowed(actor uuid,session_id uuid DEFAULT NULL,match_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND ((SELECT bool_and(live_enabled) FROM private.originals_release)
 OR EXISTS(SELECT FROM public.dealer_games d WHERE d.session_id=originals_live_actor_allowed.session_id AND d.game_type IN('crib-lab','chucky-showdown') AND (match_id IS NULL OR d.id=match_id)))
$$;
CREATE FUNCTION private.originals_live_admission_allowed(actor uuid,session_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND (SELECT bool_and(live_enabled) FROM private.originals_release)
$$;
CREATE FUNCTION private.originals_live_supported_rules(rules jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT rules->>'game' IN('crib-lab','chucky-showdown') AND rules->>'rounds'='3' AND EXISTS(SELECT FROM private.arcade_rulesets WHERE game=rules->>'game' AND id=rules->>'ruleset' AND config=rules->'gameplay')
$$;
CREATE FUNCTION private.originals_live_record(m private.originals_live_matches,actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(m)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000),'viewer',(SELECT id FROM public.players WHERE game_id=m.game_id AND user_id=actor AND NOT is_bot),
 'financial',jsonb_build_object('balances',CASE WHEN m.settlement IS NULL THEN (SELECT jsonb_object_agg(id::text,chips) FROM public.players WHERE game_id=m.game_id) ELSE (SELECT jsonb_object_agg(player_id::text,chips) FROM public.session_player_snapshots WHERE dealer_game_id=m.dealer_game_id AND hand_number=1) END,
 'resultId',(SELECT id FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='originals_live_terminal'),
 'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE dealer_game_id=m.dealer_game_id ORDER BY cursor DESC LIMIT 1)))
$$;
CREATE FUNCTION private.originals_live_authorize(m private.originals_live_matches,actor uuid,token uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF actor IS NULL THEN
  IF NOT EXISTS(SELECT FROM private.delayed_recovery_state r WHERE r.singleton AND r.claimed AND r.token=originals_live_authorize.token AND r.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'originals:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.originals_live_actor_allowed(actor,m.game_id,m.dealer_game_id) OR NOT EXISTS(SELECT FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor AND p.status<>'left') THEN RAISE EXCEPTION 'originals:participant_required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.originals_live_load(p_match uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.originals_live_matches;r private.originals_live_requests;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_match;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'originals:authentication_required';END IF;
 PERFORM private.originals_live_authorize(m,p_actor);
 SELECT * INTO r FROM private.originals_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
 RETURN private.originals_live_record(m,p_actor)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $$;
CREATE FUNCTION private.originals_live_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.originals_live_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision) ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER originals_live_publish AFTER INSERT OR UPDATE ON private.originals_live_matches FOR EACH ROW EXECUTE FUNCTION private.originals_live_publish();

;
CREATE OR REPLACE FUNCTION public.originals_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.originals_live_actor_allowed(actor,p_game_id) OR p_game_type NOT IN('crib-lab','chucky-showdown') THEN RAISE EXCEPTION 'originals:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'originals:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'originals:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 IF (p_config-ARRAY['ante_amount'])<>'{}'::jsonb THEN RAISE EXCEPTION 'originals:configuration';END IF;
 IF g.real_money AND NOT EXISTS(SELECT FROM private.originals_release WHERE game=p_game_type AND live_real_qualified) THEN RAISE EXCEPTION 'originals:real_money_closed';END IF;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'originals:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'originals:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT private.originals_live_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'originals:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'originals:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.originals_live_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'originals:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'originals:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'originals:player_count';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'originals:humans_required';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'originals:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,p_game_type,jsonb_build_object('ante_amount',stake_i,'rules',private.originals_config(p_game_type))) RETURNING * INTO dg;
 -- Freeze already-authorized access for this match. Expiry/revocation prevents
 -- new matches, but cannot strand accepted liabilities or an unresolved offer.

 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type=p_game_type,current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_begin(p_game uuid, p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; dg public.dealer_games; people jsonb; s jsonb; r uuid:=gen_random_uuid(); n integer; stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('crib-lab','chucky-showdown') OR g.is_paused THEN RAISE EXCEPTION 'originals:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i OR NOT private.originals_live_supported_rules(dg.config->'rules') THEN RAISE EXCEPTION 'originals:configuration_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'originals:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'chips',p.chips)
  ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id)
 INTO people FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 n:=jsonb_array_length(people);
 IF n NOT BETWEEN 2 AND 7 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'originals:accepted_player_count';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean AND NOT private.originals_live_actor_allowed((p->>'userId')::uuid,g.id,dg.id)) THEN RAISE EXCEPTION 'originals:tester_required' USING ERRCODE='42501';END IF;
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
 VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'rules',dg.config->'rules',
  'players',people,'round',1,'dealerIndex',n-1,'scores',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(people) p),'rounds','[]'::jsonb);
 s:=s||jsonb_build_object('phase','ready','turnIndex',0,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'board',NULL,'runs','{}'::jsonb,'results','[]'::jsonb);
 INSERT INTO private.originals_live_matches(dealer_game_id,game_id,round_id,state,stake,player_controls)
 VALUES(p_dealer,p_game,r,s,stake_i,(SELECT jsonb_object_agg(p.id::text,jsonb_build_object('autoPlay',p.auto_fold,'sitOutNextHand',p.sit_out_next_hand,'intentVersion',p.intent_version)) FROM public.players p WHERE p.game_id=p_game AND p.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(people) x)));
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.originals_live_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM m.state#>>'{rules,game}' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR jsonb_array_length(m.state->'rounds')<>3 OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'originals:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'originals:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'originals_live_terminal',m.state#>>'{rules,game}',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  (m.state#>>'{rules,game}')||': '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.originals_live_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0))+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result=(m.state#>>'{rules,game}')||' complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.originals_live_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'originals:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished OR g.is_paused OR m.paused_at IS NOT NULL THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM m.state#>>'{rules,game}' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'originals:close_identity';END IF;
 IF g.status<>'session_ended' THEN
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false WHERE game_id=m.game_id;
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL)<2 THEN
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT array_agg(position ORDER BY position DESC) INTO positions FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL AND NOT is_bot;
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='originals_live_terminal';
    SELECT position INTO next_seat FROM public.players WHERE id=winner AND game_id=m.game_id AND NOT is_bot AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
    IF next_seat IS NULL THEN IF cardinality(positions)=1 THEN next_seat:=positions[1];ELSE target:='dealer_selection';END IF;END IF;
   END IF;
   IF target IS NULL THEN
    IF next_seat IS NULL THEN SELECT max(p) INTO next_seat FROM unnest(positions) p WHERE p<g.dealer_position;next_seat:=coalesce(next_seat,positions[1]);END IF;
    target:=CASE WHEN next_seat IS NULL THEN 'dealer_selection' ELSE 'game_selection' END;
   END IF;
  END IF;
  UPDATE public.games SET status=target,game_type=CASE WHEN target='session_ended' THEN game_type END,
   current_game_uuid=NULL,config_complete=false,current_round=NULL,total_hands=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
   last_round_result=NULL,awaiting_next_round=false,next_round_number=NULL,game_over_at=NULL,pot=0,
   ante_decision_deadline=NULL,buck_position=NULL,is_first_hand=false,dealer_selection_state=NULL,
   dealer_position=coalesce(next_seat,dealer_position),config_deadline=CASE WHEN target='game_selection' THEN clock_timestamp()+make_interval(secs=>greatest(1,game_setup_timer_seconds)) END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=m.game_id;
 END IF;
 UPDATE private.originals_live_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_roster_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.originals_live_matches;
BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM private.originals_live_matches WHERE game_id=NEW.game_id AND settlement IS NULL AND NOT finished) THEN NEW.waiting:=true;END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO m FROM private.originals_live_matches WHERE game_id=OLD.game_id AND settlement IS NULL AND NOT finished
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(state->'players') p WHERE p->>'id'=OLD.id::text);
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'originals:match_liability_committed';END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.is_bot IS DISTINCT FROM OLD.is_bot THEN RAISE EXCEPTION 'originals:participant_identity_frozen';END IF;
 IF NEW.position IS DISTINCT FROM OLD.position OR NEW.status IN ('left','observer') THEN
  NEW.position:=OLD.position;NEW.status:=OLD.status;NEW.stand_up_next_hand:=true;
 END IF;
 IF NEW.sitting_out AND NOT OLD.sitting_out THEN NEW.sitting_out:=OLD.sitting_out;NEW.sit_out_next_hand:=true;END IF;
 RETURN NEW;
END $function$

;
DO $$BEGIN IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure))<>'bf7dbfd1c3bb18511faa7f3cb554e486' THEN RAISE EXCEPTION 'originals:owner_changed:private.advance_ante_phase_exact';END IF;END $$;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.advance_ante_phase_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  IF v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(v_game.id,v_game.current_game_uuid,NULL,'start'); END IF;
  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup's expired transaction-local authority flags.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    v_replay_return := jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('ptown-words','quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31') THEN
      SELECT private.megatouch_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type IN('crib-lab','chucky-showdown') THEN
      SELECT private.originals_live_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='mega-card-golf' THEN
      SELECT private.mega_live_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='six-card-golf' THEN
      SELECT private.golf_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='canasta' THEN
      SELECT private.canasta_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='farkle' THEN
      SELECT private.farkle_begin_v1(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END;
$function$

;
DO $$BEGIN IF md5(pg_get_functiondef('private.megatouch_frozen_stake()'::regprocedure))<>'7cb8ab5438eefebc92518d8e3f2877bc' THEN RAISE EXCEPTION 'originals:owner_changed:private.megatouch_frozen_stake';END IF;END $$;
CREATE OR REPLACE FUNCTION private.megatouch_frozen_stake()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF OLD.game_type IN('ptown-words','quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31','six-card-golf','mega-card-golf','crib-lab','chucky-showdown') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $function$

;
CREATE TRIGGER originals_live_roster_guard BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION private.originals_live_roster_guard();
;
DO $$BEGIN IF md5(pg_get_functiondef('private.delayed_words_recover()'::regprocedure))<>'3a518efb050fc463ba5721c9aba240fb' THEN RAISE EXCEPTION 'originals:recovery_owner_changed';END IF;END $$;
CREATE OR REPLACE FUNCTION private.delayed_words_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s private.delayed_recovery_state;last_tick_i timestamptz;t uuid:=gen_random_uuid();n integer;
BEGIN
 PERFORM private.delayed_words_check_health();
 SELECT last_tick INTO last_tick_i FROM private.delayed_words_health WHERE singleton;
 n:=private.delayed_words_recover_local();
 SELECT * INTO STRICT s FROM private.delayed_recovery_state WHERE singleton FOR UPDATE;
 IF NOT s.enabled THEN RETURN n;END IF;
 IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN
  UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;RETURN n;
 END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
  WHERE m.status='active' AND NOT private.delayed_held(m.id) AND NOT c.terminal AND c.game_type<>'ptown-words'
   AND least(c.expires_at,c.gameplay_due_at)<=clock_timestamp()) AND NOT EXISTS(SELECT FROM private.originals_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000)) AND NOT EXISTS(SELECT FROM private.mega_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000)) THEN RETURN n;END IF;
 UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;
 UPDATE private.delayed_recovery_state SET token=t,claimed=false,expires_at=clock_timestamp()+interval '25 seconds',
  failure=CASE WHEN s.token IS NOT NULL THEN 'delayed:lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/delayed-recovery',
  headers:=jsonb_build_object('Content-Type','application/json','x-delayed-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
 RETURN n;
END $function$
;

-- One sequential board, typed actions, and the existing canonical financial owners.
CREATE FUNCTION private.originals_live_visible(m private.originals_live_matches, who uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s jsonb:=m.state; actor text:=s->'players'->(s->>'turnIndex')::int->>'id'; viewer uuid; financial jsonb;
BEGIN
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=who AND NOT is_bot;
 financial:=private.originals_live_record(m,who)->'financial';
 RETURN jsonb_build_object('id',m.dealer_game_id,'game',s#>>'{rules,game}','identity',s->'identity','rules',s->'rules',
 'revision',m.revision,'scope',concat_ws(':',m.round_id,s->>'round',s->>'turnIndex'),'round',s->'round',
 'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'phase',s->'phase','deadline',s->'deadline',
 'board',CASE WHEN s->'board'<>'null'::jsonb THEN private.originals_visible(s#>>'{rules,game}',s->'board',floor(extract(epoch FROM clock_timestamp())*1000)::bigint)
  ||jsonb_build_object('id',m.dealer_game_id,'revision',m.revision,'ruleset',s#>>'{rules,ruleset}') END,
 'actor',actor,'viewerId',viewer,'players',(SELECT jsonb_agg(p||jsonb_build_object('chips',financial->'balances'->(p->>'id'))) FROM jsonb_array_elements(s->'players') p),
 'scores',s->'scores','results',s->'results','canAct',viewer::text=actor AND NOT m.finished AND m.settlement IS NULL AND m.paused_at IS NULL AND s->>'phase'='playing',
 'paused',m.paused_at IS NOT NULL,'pausedAt',m.paused_at,'settled',m.settlement IS NOT NULL,'settlement',m.settlement,'finished',m.finished,
 'terminal',s->'terminal','financial',financial);
END $$;

CREATE FUNCTION private.originals_live_reduce(s jsonb, intent jsonb, at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor text; board jsonb; round_i int:=(s->>'round')::int; turn_i int:=(s->>'turnIndex')::int; result jsonb;
BEGIN
 IF s->>'phase'='complete' THEN RETURN s;END IF;
 IF s->>'phase' IN('ready','round_complete') THEN
  IF intent->>'type'<>'tick' OR at_ms<(s->>'deadline')::bigint THEN RAISE EXCEPTION 'originals:transition_pending';END IF;
  IF s->>'phase'='round_complete' THEN
   turn_i:=turn_i+1;IF turn_i=jsonb_array_length(s->'players') THEN turn_i:=0;round_i:=round_i+1;END IF;
  END IF;
  actor:=s->'players'->turn_i->>'id';
  board:=private.originals_board(s#>>'{rules,game}','deal',s->'rules',round_i,(s->'scores'->>actor)::bigint,NULL,at_ms);
  RETURN s||jsonb_build_object('round',round_i,'turnIndex',turn_i,'phase','playing','board',board,'deadline',board->'nextDue');
 END IF;
 actor:=s->'players'->turn_i->>'id';
 board:=private.originals_board(s#>>'{rules,game}','reduce',s->'rules',round_i,(s->'scores'->>actor)::bigint,s->'board',at_ms,
  intent->>'type',CASE WHEN intent?'items' THEN ARRAY(SELECT value::integer FROM jsonb_array_elements_text(intent->'items')) END,(intent->>'level')::int);
 s:=s||jsonb_build_object('board',board,'deadline',board->'nextDue');
 IF board->>'phase'='stage_complete' THEN
  result:=jsonb_build_object('actor',actor,'round',round_i,'score',(board->>'score')::bigint-(s->'scores'->>actor)::bigint,'at',at_ms);
  s:=jsonb_set(s,ARRAY['scores',actor],board->'score')||jsonb_build_object('phase','round_complete','results',(s->'results')||jsonb_build_array(result),
   'presentation',jsonb_build_object('startedAt',at_ms,'endsAt',board->'nextDue'));
  IF turn_i=jsonb_array_length(s->'players')-1 THEN
   s:=jsonb_set(s,'{rounds}',(s->'rounds')||jsonb_build_array(jsonb_build_object('round',round_i,'scores',s->'scores')));
   IF round_i=3 THEN s:=jsonb_set(s,'{phase}','"complete"');END IF;
  END IF;
 END IF;
 RETURN s;
END $$;

CREATE FUNCTION private.originals_live_step(match_id uuid, who uuid, request_id uuid DEFAULT NULL, expected_revision bigint DEFAULT NULL, intent jsonb DEFAULT NULL, token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.originals_live_matches;g public.games;r private.originals_live_requests;fingerprint text;at_ms bigint;next_state jsonb;n int:=0;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=match_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=match_id FOR UPDATE;
 PERFORM private.originals_live_authorize(m,who,token);
 fingerprint:=md5(jsonb_build_array(expected_revision,intent)::text);
 IF request_id IS NOT NULL THEN
  SELECT * INTO r FROM private.originals_live_requests WHERE dealer_game_id=match_id AND originals_live_requests.request_id=originals_live_step.request_id;
  IF FOUND THEN
   IF r.actor IS DISTINCT FROM who OR r.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'originals:request_conflict';END IF;
   RETURN private.originals_live_visible(m,who);
  END IF;
 END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF m.finished THEN RETURN private.originals_live_visible(m,who);END IF;
 IF m.paused_at IS NOT NULL OR g.is_paused THEN
  IF request_id IS NOT NULL THEN RAISE EXCEPTION 'originals:paused';END IF;
  RETURN private.originals_live_visible(m,who);
 END IF;
 IF m.settlement IS NOT NULL THEN
  PERFORM private.originals_live_finish_postgame(match_id);
  SELECT * INTO m FROM private.originals_live_matches WHERE dealer_game_id=match_id;
  RETURN private.originals_live_visible(m,who);
 END IF;
 IF g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM match_id OR g.game_type IS DISTINCT FROM m.state#>>'{rules,game}' THEN RAISE EXCEPTION 'originals:inactive';END IF;
 IF request_id IS NOT NULL THEN
  IF who IS NULL OR expected_revision IS DISTINCT FROM m.revision OR intent IS NULL OR jsonb_typeof(intent)<>'object' THEN RAISE EXCEPTION 'originals:stale_action';END IF;
  IF m.state->'players'->(m.state->>'turnIndex')::int->>'userId' IS DISTINCT FROM who::text THEN RAISE EXCEPTION 'originals:not_actor';END IF;
  IF intent->>'type' NOT IN('select','lock','pass','replace','swap','stand','fold','stay','press') OR (intent-ARRAY['type','items','level'])<>'{}' THEN RAISE EXCEPTION 'originals:invalid_action';END IF;
  IF at_ms>=(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'originals:deadline';END IF;
  next_state:=private.originals_live_reduce(m.state,intent,at_ms);
  UPDATE private.originals_live_matches SET state=next_state,revision=revision+1 WHERE dealer_game_id=match_id RETURNING * INTO m;
  INSERT INTO private.originals_live_requests VALUES(match_id,request_id,who,fingerprint);
 ELSE
  WHILE m.state->>'phase'<>'complete' AND at_ms>=(m.state->>'deadline')::bigint AND n<128 LOOP
   next_state:=private.originals_live_reduce(m.state,'{"type":"tick"}',(m.state->>'deadline')::bigint);
   IF next_state=m.state THEN RAISE EXCEPTION 'originals:nonadvancing_clock';END IF;
   UPDATE private.originals_live_matches SET state=next_state,revision=revision+1 WHERE dealer_game_id=match_id RETURNING * INTO m;
   n:=n+1;
  END LOOP;
 END IF;
 IF m.state->>'phase'='complete' THEN PERFORM private.originals_live_settle(match_id);SELECT * INTO m FROM private.originals_live_matches WHERE dealer_game_id=match_id;END IF;
 RETURN private.originals_live_visible(m,who);
END $$;

CREATE FUNCTION public.originals_live_snapshot(p_match uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'originals:authentication_required';END IF;RETURN private.originals_live_step(p_match,auth.uid());END $$;
CREATE FUNCTION public.originals_live_action(p_match uuid,p_request uuid,p_revision bigint,p_intent jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF auth.uid() IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'originals:authentication_required';END IF;RETURN private.originals_live_step(p_match,auth.uid(),p_request,p_revision,p_intent);END $$;
CREATE FUNCTION public.originals_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(game,live_enabled AND EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND is_active)
  AND (p_session_id IS NULL OR EXISTS(SELECT FROM public.players WHERE game_id=p_session_id AND user_id=auth.uid() AND status<>'left'))
  AND (p_session_id IS NULL OR NOT EXISTS(SELECT FROM public.games WHERE id=p_session_id AND real_money) OR live_real_qualified)),'{}') FROM private.originals_release
$$;

CREATE FUNCTION private.originals_shift(value jsonb, delta bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE answer jsonb:='{}';item record;
BEGIN
 IF jsonb_typeof(value)='array' THEN RETURN (SELECT coalesce(jsonb_agg(private.originals_shift(v,delta)),'[]') FROM jsonb_array_elements(value) v);END IF;
 IF jsonb_typeof(value)<>'object' THEN RETURN value;END IF;
 FOR item IN SELECT * FROM jsonb_each(value) LOOP
  answer:=answer||jsonb_build_object(item.key,CASE
   WHEN item.key IN('config','rules') THEN item.value
   WHEN item.key IN('since','due','deadline','nextDue','phaseUntil','startsAt','startedAt','endsAt','scoredAt') AND jsonb_typeof(item.value)='number' AND item.value::text<>'0' THEN to_jsonb(item.value::text::bigint+delta)
   ELSE private.originals_shift(item.value,delta) END);
 END LOOP;RETURN answer;
END $$;
CREATE FUNCTION private.originals_live_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.originals_live_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 SELECT * INTO m FROM private.originals_live_matches WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.originals_live_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN
  UPDATE private.originals_live_matches SET state=private.originals_shift(state,at_ms-m.paused_at),paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION private.originals_live_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.dealer_game_id IS DISTINCT FROM OLD.dealer_game_id OR NEW.round_id IS DISTINCT FROM OLD.round_id
 OR NEW.stake IS DISTINCT FROM OLD.stake OR NEW.state->'identity' IS DISTINCT FROM OLD.state->'identity'
 OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules' OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players'
 OR NEW.revision<OLD.revision OR (OLD.finished AND NOT NEW.finished)
 OR (OLD.settlement IS NOT NULL AND (NEW.settlement IS DISTINCT FROM OLD.settlement
 OR NEW.state-ARRAY['terminal','presentation','deadline','board'] IS DISTINCT FROM OLD.state-ARRAY['terminal','presentation','deadline','board']
 OR (NEW.state->'terminal')-ARRAY['startedAt','deadline'] IS DISTINCT FROM (OLD.state->'terminal')-ARRAY['startedAt','deadline']))
 THEN RAISE EXCEPTION 'originals:immutable_match';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER originals_live_guard BEFORE UPDATE ON private.originals_live_matches FOR EACH ROW EXECUTE FUNCTION private.originals_live_guard();
CREATE TRIGGER originals_live_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type IN('crib-lab','chucky-showdown') AND NEW.is_paused IS DISTINCT FROM OLD.is_paused) EXECUTE FUNCTION private.originals_live_pause();
CREATE FUNCTION public.originals_live_recover(p_token uuid) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row record;n int:=0;
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_recovery_state WHERE singleton AND claimed AND token=p_token AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'originals:recovery_denied';END IF;
 FOR row IN SELECT dealer_game_id FROM private.originals_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000) ORDER BY created_at LIMIT 16 LOOP
  PERFORM private.originals_live_step(row.dealer_game_id,NULL,NULL,NULL,NULL,p_token);n:=n+1;
 END LOOP;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.originals_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.originals_live_snapshot(uuid),public.originals_live_action(uuid,uuid,bigint,jsonb),public.originals_capabilities(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.originals_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.originals_live_snapshot(uuid),public.originals_live_action(uuid,uuid,bigint,jsonb),public.originals_capabilities(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.originals_live_load(uuid,uuid,uuid),public.originals_live_recover(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.originals_live_recover(uuid) TO service_role;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'originals_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;

$originals_body$;
END $originals_install$;
NOTIFY pgrst, 'reload schema';
