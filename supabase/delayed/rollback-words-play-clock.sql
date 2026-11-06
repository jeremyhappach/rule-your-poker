-- Use only after stopping new timed admissions and draining ALL timed invitations and games.
DO $$ BEGIN IF EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
 WHERE c.game_type='ptown-words' AND c.config->>'version'='ptown-words/2' AND NOT c.terminal AND m.status IN ('active','invited'))
 THEN RAISE EXCEPTION 'Timed Words games must drain before rollback'; END IF; END $$;
CREATE OR REPLACE FUNCTION private.delayed_expire(child uuid, expected_segment bigint, expected_expiry timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children; m private.delayed_matches;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment OR c.expires_at IS DISTINCT FROM expected_expiry
  OR c.expires_at IS NULL OR clock_timestamp()<c.expires_at THEN RETURN false; END IF;
 -- An earlier active-game deadline must be resolved by the game adapter first.
 IF c.gameplay_due_at IS NOT NULL AND c.gameplay_due_at<c.expires_at THEN RETURN false; END IF;
 PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',CASE WHEN c.actor=m.organizer THEN m.opponent ELSE m.organizer END,
  jsonb_build_object('segment',c.segment,'expiredAt',c.expires_at,'actor',c.actor));
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_words_recover_local()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches;c private.delayed_children;n integer:=0;
BEGIN
 PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);
 IF NOT EXISTS(SELECT FROM private.delayed_words_health WHERE singleton AND enabled) THEN RETURN 0;END IF;
 FOR m IN SELECT * FROM private.delayed_matches WHERE status='invited' AND expires_at<=clock_timestamp() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id;PERFORM private.delayed_notify(m.id);n:=n+1;
 END LOOP;
 FOR m IN SELECT * FROM private.delayed_matches WHERE status='active' AND NOT private.delayed_held(id) AND EXISTS(
  SELECT FROM private.delayed_children work_child WHERE work_child.match_id=delayed_matches.id AND NOT work_child.terminal AND
  (work_child.expires_at<=clock_timestamp() OR (work_child.last_call_at<=clock_timestamp() AND EXISTS(SELECT FROM public.platform_notifications n WHERE n.match_id=work_child.match_id AND n.user_id=work_child.actor AND n.kind='turn' AND n.actionable AND NOT (n.payload->>'lastCall')::boolean))))
 ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  IF private.delayed_held(m.id) THEN CONTINUE;END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id AND NOT terminal ORDER BY id FOR UPDATE LOOP
   IF c.game_type='ptown-words' AND private.delayed_expire(c.id,c.segment,c.expires_at) THEN n:=n+1;END IF;
  END LOOP;
  PERFORM private.delayed_notify(m.id);
 END LOOP;
 UPDATE private.delayed_words_health SET last_tick=clock_timestamp() WHERE singleton;
 RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_words_view(child uuid, viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;receipt private.delayed_settlements;s jsonb;held boolean;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) OR viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent) OR m.status NOT IN('active','settled') OR c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM private.delayed_outcomes WHERE child_id=c.id;
 SELECT * INTO receipt FROM private.delayed_settlements WHERE match_id=m.id;
 held:=private.delayed_held(m.id);
 s:=private.ptown_words_visible(c.state,viewer::text);
 RETURN s||jsonb_build_object('identity',jsonb_build_object('sessionId',m.id,'dealerGameId',c.id,'roundId',c.id),
 'revision',c.revision,'viewerId',viewer,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),
 'deadline',floor(extract(epoch FROM c.expires_at)*1000),'lastCallAt',floor(extract(epoch FROM c.last_call_at)*1000),
 'canAct',NOT c.terminal AND NOT held AND c.actor=viewer,'paused',held,'pausedAt',NULL,'finished',c.terminal,
 'phase',CASE WHEN c.terminal THEN 'complete' ELSE 'playing' END,'settlement',CASE WHEN receipt.match_id IS NOT NULL THEN jsonb_build_object(m.organizer::text,receipt.organizer_delta,m.opponent::text,receipt.opponent_delta) END,
 'outcome',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'delta',CASE WHEN viewer=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END,
 'terminal',CASE WHEN c.terminal THEN jsonb_build_object('resultId',receipt.result_id,'winnerIds',CASE WHEN o.winner IS NULL THEN jsonb_build_array(m.organizer,m.opponent) ELSE jsonb_build_array(o.winner) END,'score',(SELECT max(value::int) FROM jsonb_each_text(c.state->'scores')),'startedAt',floor(extract(epoch FROM o.completed_at)*1000),'deadline',floor(extract(epoch FROM o.completed_at)*1000)) END,
 'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',receipt.result_id,'batch',NULL));
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_words_action(p_child uuid, p_request uuid, p_revision bigint, p_action text, p_items jsonb DEFAULT NULL::jsonb)
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
END $function$;

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
DROP FUNCTION IF EXISTS private.delayed_words_finish_turn(private.delayed_children,jsonb,timestamptz);

CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
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
END $function$;
