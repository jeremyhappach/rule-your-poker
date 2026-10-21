-- Local candidate only. No production application or activation authorized.
DO $$ BEGIN
 IF md5(pg_get_functiondef('private.race_poker_rules()'::regprocedure))<>'7e900424704fae3be1eee19b403164e8'
 OR md5(pg_get_functiondef('private.race_poker_deal(jsonb,bigint)'::regprocedure))<>'e9149f0d607a3b83226b9abddf3b4b65'
 OR md5(pg_get_functiondef('private.race_poker_reduce(jsonb,text,integer[],bigint)'::regprocedure))<>'a7ff3fdc5e9305285036a7b15533f62f'
 OR md5(pg_get_functiondef('private.race_poker_execute(uuid,uuid,bigint,uuid,text,integer[],text)'::regprocedure))<>'96587d90e9aa4f1f167e649dc81d4af8'
 OR md5(pg_get_functiondef('private.race_poker_schedule_bot()'::regprocedure))<>'477b5188a1360677ff57bfbe51b39907'
 OR md5(pg_get_functiondef('private.race_poker_recover()'::regprocedure))<>'64afcc8024305c0b370f7254b02243a9'
 OR md5(pg_get_functiondef('public.race_poker_snapshot(uuid)'::regprocedure))<>'495835781273037b386370fc7e7e7afb'
 OR md5(pg_get_functiondef('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure))<>'a69f39fefb234c3b01114c8049fdbbb6'
 OR md5(pg_get_functiondef('public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure))<>'1fa2220c33734d1cf14c11f3eaef432b'
 THEN RAISE EXCEPTION 'race_poker_v2:authority_drift';END IF;
END $$;
-- Race-only timeout/control amendment. Existing v1 rules and matches retain their behavior.
CREATE OR REPLACE FUNCTION private.race_poker_rules_v1() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"race-poker/1","handMs":30000,"holdMs":2000,"target":48000,"roundCap":16,"deckSize":52,"choices":3,"handSize":5,"equalFinalHands":true,"fifthReplacement":false,"timeoutPoints":0,"awards":[4500,6700,9000,12000,15000,18700,22500,28500,37500]}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.race_poker_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"race-poker/2","handMs":30000,"holdMs":2000,"target":48000,"roundCap":16,"deckSize":52,"choices":3,"handSize":5,"equalFinalHands":true,"fifthReplacement":false,"timeoutPoints":0,"humanTimeout":"canonical-autoplay-or-pause","awards":[4500,6700,9000,12000,15000,18700,22500,28500,37500]}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.race_poker_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=private.race_poker_shuffle();starter integer;totals jsonb;
BEGIN
 IF (s->'rules' IS DISTINCT FROM private.race_poker_rules() AND s->'rules' IS DISTINCT FROM private.race_poker_rules_v1()) OR jsonb_array_length(s->'players')<>2 THEN RAISE EXCEPTION 'race_poker:configuration';END IF;
 IF NOT s ? 'starter' THEN
  starter:=private.race_poker_random(2);
  SELECT jsonb_object_agg(p->>'id',0) INTO totals FROM jsonb_array_elements(s->'players')p;
  s:=s||jsonb_build_object('starter',starter,'turnIndex',starter,'handInRound',0,'stage',1,'scores',totals,'stages','[]'::jsonb,'botPolicy','race-poker-bot/1');
 END IF;
 RETURN s||jsonb_build_object('deck',to_jsonb(cards),'cursor',3,'choices',to_jsonb(cards[1:3]),'hand','[]'::jsonb,
  'phase','playing','startedAt',at_ms,'deadline',at_ms+30000,'result',NULL,
  'event',jsonb_build_object('label',CASE WHEN coalesce((s->>'finalHand')::boolean,false) THEN 'Final hand' ELSE 'Choose a card' END,'points',0));
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE player text:=s->'players'->(s->>'turnIndex')::integer->>'id';hand_i jsonb:=s->'hand';
 result_i jsonb;points integer:=0;before_i integer:=(s->'scores'->>player)::integer;slot integer;cursor_i integer;
 round_i integer:=(s->>'stage')::integer;starter_i integer:=(s->>'starter')::integer;deadline_i bigint:=(s->>'deadline')::bigint;
BEGIN
 IF (s->'rules' IS DISTINCT FROM private.race_poker_rules() AND s->'rules' IS DISTINCT FROM private.race_poker_rules_v1()) THEN RAISE EXCEPTION 'race_poker:configuration';END IF;
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'race_poker:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action<>'tick' THEN RAISE EXCEPTION 'race_poker:phase';END IF;
  IF at_ms<deadline_i THEN RETURN s;END IF;
  IF (s->>'handInRound')::integer=1 THEN
   IF round_i=16 OR EXISTS(SELECT 1 FROM jsonb_each_text(s->'scores')v WHERE v.value::integer>=48000) THEN
    RETURN s||jsonb_build_object('phase','complete','deadline',0,'choices','[]'::jsonb,'hand','[]'::jsonb);
   END IF;
   starter_i:=1-starter_i;
   s:=s||jsonb_build_object('stage',round_i+1,'starter',starter_i,'turnIndex',starter_i,'handInRound',0,'finalHand',false);
  ELSE
   s:=s||jsonb_build_object('turnIndex',1-starter_i,'handInRound',1,'finalHand',
    EXISTS(SELECT 1 FROM jsonb_each_text(s->'scores')v WHERE v.value::integer>=48000));
  END IF;
  RETURN private.race_poker_deal(s,deadline_i);
 END IF;
 IF s->>'phase'<>'playing' THEN RAISE EXCEPTION 'race_poker:phase';END IF;
 IF action='tick' THEN
  IF at_ms<deadline_i THEN RETURN s;END IF;
  result_i:=jsonb_build_object('label','Time expired — 0 points','points',0,'reason','timeout');
  hand_i:='[]'::jsonb;at_ms:=deadline_i;
 ELSIF action='choose' OR (action='auto_choose' AND s#>>'{rules,version}'='race-poker/2') THEN
  IF action='choose' AND at_ms>=deadline_i THEN RAISE EXCEPTION 'race_poker:deadline';END IF;
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
  slot:=items[1];
  hand_i:=hand_i||jsonb_build_array(s->'choices'->slot);
  IF jsonb_array_length(hand_i)<5 THEN
   cursor_i:=(s->>'cursor')::integer;
   RETURN jsonb_set(s,ARRAY['choices',slot::text],s->'deck'->cursor_i)||
    jsonb_build_object('hand',hand_i,'cursor',cursor_i+1,'event',jsonb_build_object('label','Card selected','points',0,'slot',slot));
  END IF;
  -- Fifth pick: score and commit, never read or reveal the next hidden card.
  result_i:=private.race_poker_score(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(hand_i)))||'{"reason":"hand"}'::jsonb;
  points:=(result_i->>'points')::integer;
 ELSE RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 result_i:=result_i||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',round_i,player),
  'playerId',player,'stage',round_i,'hand',hand_i,'scoreBefore',before_i,'score',before_i+points,'stageScore',points,'completedAt',at_ms);
 s:=jsonb_set(s,ARRAY['scores',player],to_jsonb(before_i+points));
 RETURN (s-ARRAY['deck','cursor'])||jsonb_build_object('hand',hand_i,'choices','[]'::jsonb,'phase','stage_complete','deadline',at_ms+2000,
  'result',result_i,'stages',s->'stages'||jsonb_build_array(result_i),'event',result_i);
END $$;

-- Separately versioned policy. The function accepts only an explicit public
-- hand and choices, never a match, deck, cursor, or shuffle seed.
-- Deterministic hypothetical samples allow exact hidden-order independence tests.

CREATE OR REPLACE FUNCTION private.race_poker_execute(
 dealer uuid,request uuid,expected bigint,actor uuid,action text,items integer[],caller text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.race_poker_matches;g public.games;prior private.race_poker_requests;
 participant public.players; modern boolean; saved jsonb; control jsonb;
 command jsonb:=jsonb_build_object('revision',expected,'action',action,'items',items,'caller',caller);
 at_ms bigint;receipt_i jsonb;member jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'race_poker:participant_required' USING ERRCODE='42501';END IF;
 IF request IS NULL OR expected IS NULL OR caller NOT IN('human','bot','recovery') THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer FOR UPDATE;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 SELECT value INTO member FROM jsonb_array_elements(m.state->'players')p WHERE p->>'id'=actor::text;
 IF member IS NULL THEN RAISE EXCEPTION 'race_poker:participant_required' USING ERRCODE='42501';END IF;
 IF caller='human' AND (coalesce((member->>'isBot')::boolean,false) OR auth.uid() IS DISTINCT FROM (member->>'userId')::uuid
  OR NOT private.race_poker_actor_allowed(auth.uid())) THEN RAISE EXCEPTION 'race_poker:participant_required' USING ERRCODE='42501';END IF;
 modern:=m.state#>>'{rules,version}'='race-poker/2';
 SELECT * INTO STRICT participant FROM public.players WHERE id=actor AND game_id=g.id FOR UPDATE;
 IF caller='bot' AND NOT (participant.is_bot OR (modern AND participant.auto_fold)) THEN RAISE EXCEPTION 'race_poker:bot_required';END IF;
 IF (caller='recovery' AND action<>'tick') OR (caller='bot' AND action<>'choose') OR (caller='human' AND action NOT IN ('choose','autoplay')) OR (action='autoplay' AND NOT modern) THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 SELECT * INTO prior FROM private.race_poker_requests WHERE dealer_game_id=dealer AND request_id=request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM actor OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'race_poker:replay_conflict';END IF;
  RETURN prior.receipt;
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM dealer OR g.game_type IS DISTINCT FROM 'race-poker' OR g.status<>'in_progress' OR m.finished OR ((g.is_paused OR m.paused_at IS NOT NULL) AND action<>'autoplay') THEN RAISE EXCEPTION 'race_poker:inactive';END IF;
 IF m.revision<>expected THEN RAISE EXCEPTION 'race_poker:stale_revision';END IF;
 IF action='autoplay' THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT IN (0,1) OR m.settlement IS NOT NULL THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
  control:=public.set_automatic_play(g.id,m.round_id,dealer,actor,participant.intent_version,items[1]=1);
  IF control->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'race_poker:stale_revision';END IF;
  SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer;
  -- An expired automated turn needs a fresh human decision window on reclaim.
  IF items[1]=0 AND participant.auto_fold AND m.state->>'phase'='playing' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=actor::text
   AND (m.state->>'deadline')::bigint<=coalesce(m.paused_at,at_ms) THEN
   UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(coalesce(m.paused_at,at_ms)+30000)),revision=revision+1 WHERE dealer_game_id=dealer RETURNING * INTO m;
  END IF;
 ELSE
  IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'race_poker:spectator' USING ERRCODE='42501';END IF;
  IF caller='human' AND modern AND participant.auto_fold THEN RAISE EXCEPTION 'race_poker:autoplay_active';END IF;
  IF caller='bot' AND (m.bot_due_at IS NULL OR m.bot_due_at>at_ms) THEN RAISE EXCEPTION 'race_poker:bot_not_due';END IF;
  IF modern AND action='tick' AND m.state->>'phase'='playing' AND (m.state->>'deadline')::bigint<=at_ms THEN
   IF participant.is_bot OR participant.auto_fold THEN RAISE EXCEPTION 'race_poker:automatic_turn';END IF;
   IF g.real_money THEN
    -- Same unresolved hand, canonical pause owner, full human window on resume.
    UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(at_ms+30000)),revision=revision+1 WHERE dealer_game_id=dealer;
    saved:=private.capture_recovery_context();
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    control:=public.set_game_paused(g.id,true,dealer,g.pause_version);
    PERFORM private.restore_recovery_context(saved);
    IF control->>'outcome'<>'paused' THEN RAISE EXCEPTION 'race_poker:pause_failed';END IF;
   ELSE
    UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=actor;
   END IF;
   SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer;
  ELSE
   m.state:=private.race_poker_reduce(m.state,CASE WHEN modern AND caller='bot' THEN 'auto_choose' ELSE action END,items,at_ms);
   UPDATE private.race_poker_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=dealer RETURNING * INTO m;
  END IF;
 END IF;
 IF m.state->>'phase'='complete' THEN
  PERFORM private.race_poker_settle(dealer);
  SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer;
 END IF;
 receipt_i:=jsonb_build_object('requestId',request,'dealerGameId',dealer,'revision',m.revision,'committedAt',at_ms,'frame',private.race_poker_visible(m.state));
 INSERT INTO private.race_poker_requests(dealer_game_id,request_id,actor,command,receipt) VALUES(dealer,request,actor,command,receipt_i);
 RETURN receipt_i;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_schedule_bot() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE automatic boolean;
BEGIN
 SELECT is_bot OR (NEW.state#>>'{rules,version}'='race-poker/2' AND auto_fold) INTO automatic
 FROM public.players WHERE id=(NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'id')::uuid;
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL OR NEW.state->>'phase'<>'playing' OR NOT coalesce(automatic,false) THEN NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' OR OLD.bot_due_at IS NULL OR OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_recover() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE work record;m private.race_poker_matches;at_ms bigint;actor uuid;action_i text; automatic boolean;items_i integer[];request_i uuid;n integer:=0;i integer;v jsonb;
BEGIN
 FOR work IN SELECT dealer_game_id,round_id,game_id FROM private.race_poker_matches
  WHERE NOT finished AND paused_at IS NULL AND
   (least((state->>'deadline')::bigint,bot_due_at)<=floor(extract(epoch FROM clock_timestamp())*1000)
    OR settlement IS NOT NULL) ORDER BY dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=work.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  PERFORM 1 FROM public.games WHERE id=work.game_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=work.dealer_game_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  IF m.paused_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.games WHERE id=m.game_id AND current_game_uuid=m.dealer_game_id AND NOT is_paused) THEN CONTINUE;END IF;
  FOR i IN 1..64 LOOP
   IF m.settlement IS NOT NULL THEN PERFORM private.race_poker_finish_postgame(m.dealer_game_id);EXIT;END IF;
   at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
   actor:=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid;
   SELECT is_bot OR auto_fold INTO automatic FROM public.players WHERE id=actor;
   IF m.state#>>'{rules,version}'='race-poker/2' AND m.state->>'phase'='playing' AND automatic THEN
    IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms THEN EXIT;END IF;
    v:=private.race_poker_visible(m.state);
    items_i:=ARRAY[private.race_poker_bot_choice(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(v->'hand')),ARRAY(SELECT value::integer FROM jsonb_array_elements_text(v->'choices')))];
    action_i:='choose';
   ELSIF (m.state->>'deadline')::bigint<=at_ms THEN action_i:='tick';items_i:=NULL;
   ELSIF m.bot_due_at<=at_ms THEN
    -- Snapshot the allowed information before strategy. This function cannot
    -- receive the real hidden deck, even indirectly.
    v:=private.race_poker_visible(m.state);
    items_i:=ARRAY[private.race_poker_bot_choice(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(v->'hand')),ARRAY(SELECT value::integer FROM jsonb_array_elements_text(v->'choices')))];
    action_i:='choose';
   ELSE EXIT;END IF;
   request_i:=md5(concat_ws(':','race-poker/1',m.dealer_game_id,m.revision,action_i))::uuid;
   BEGIN
    PERFORM private.race_poker_execute(m.dealer_game_id,request_i,m.revision,actor,action_i,items_i,CASE WHEN action_i='tick' THEN 'recovery' ELSE 'bot' END);
   EXCEPTION WHEN OTHERS THEN
    -- Policy evaluation can cross the deadline while holding the lock. Let the
    -- same executor adjudicate timeout; do not abort earlier recovered work.
    IF action_i<>'choose' OR SQLERRM<>'race_poker:deadline' THEN RAISE;END IF;
    request_i:=md5(concat_ws(':','race-poker/1',m.dealer_game_id,m.revision,'tick'))::uuid;
    PERFORM private.race_poker_execute(m.dealer_game_id,request_i,m.revision,actor,'tick',NULL,'recovery');
   END;
   SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=m.dealer_game_id;
   n:=n+1;
   IF m.paused_at IS NOT NULL THEN EXIT;END IF;
  END LOOP;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.race_poker_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.race_poker_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
 IF viewer IS NULL OR NOT private.race_poker_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'race_poker:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='race_poker_terminal';
 RETURN private.race_poker_visible(m.state)||CASE WHEN m.state#>>'{rules,version}'='race-poker/2' THEN jsonb_build_object('automaticPlayers',coalesce((SELECT jsonb_object_agg(p.id,m.settlement IS NULL AND (p.is_bot OR coalesce(p.auto_fold,false))) FROM public.players p WHERE p.game_id=m.game_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') frozen WHERE frozen->>'id'=p.id::text)),'{}'::jsonb)) ELSE '{}'::jsonb END||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT EXISTS(SELECT 1 FROM public.players WHERE id=viewer AND auto_fold AND m.state#>>'{rules,version}'='race-poker/2') AND NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$
;

CREATE OR REPLACE FUNCTION private.race_poker_participation_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (NEW.auto_fold,NEW.sit_out_next_hand) IS DISTINCT FROM (OLD.auto_fold,OLD.sit_out_next_hand) THEN
  UPDATE private.race_poker_matches SET revision=revision+1
  WHERE game_id=NEW.game_id AND NOT finished AND settlement IS NULL AND state#>>'{rules,version}'='race-poker/2';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER race_poker_participation_changed AFTER UPDATE OF auto_fold,sit_out_next_hand ON public.players
 FOR EACH ROW EXECUTE FUNCTION private.race_poker_participation_changed();

REVOKE ALL ON FUNCTION private.race_poker_rules_v1(),private.race_poker_participation_changed() FROM PUBLIC,anon,authenticated,service_role;
