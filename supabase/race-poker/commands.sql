-- All mutation callers enter this executor. Private EXECUTE is revoked; only
-- the authenticated wrapper and the database recovery owner may call it.
CREATE OR REPLACE FUNCTION private.race_poker_execute(
 dealer uuid,request uuid,expected bigint,actor uuid,action text,items integer[],caller text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.race_poker_matches;g public.games;prior private.race_poker_requests;
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
 IF caller='bot' AND NOT coalesce((member->>'isBot')::boolean,false) THEN RAISE EXCEPTION 'race_poker:bot_required';END IF;
 IF (caller='recovery' AND action<>'tick') OR (caller<>'recovery' AND action<>'choose') THEN RAISE EXCEPTION 'race_poker:invalid_command';END IF;
 SELECT * INTO prior FROM private.race_poker_requests WHERE dealer_game_id=dealer AND request_id=request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM actor OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'race_poker:replay_conflict';END IF;
  RETURN prior.receipt;
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM dealer OR g.game_type IS DISTINCT FROM 'race-poker' OR g.status<>'in_progress' OR m.finished OR g.is_paused OR m.paused_at IS NOT NULL THEN RAISE EXCEPTION 'race_poker:inactive';END IF;
 IF m.revision<>expected THEN RAISE EXCEPTION 'race_poker:stale_revision';END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'race_poker:spectator' USING ERRCODE='42501';END IF;
 IF caller='bot' AND (m.bot_due_at IS NULL OR m.bot_due_at>at_ms) THEN RAISE EXCEPTION 'race_poker:bot_not_due';END IF;
 m.state:=private.race_poker_reduce(m.state,action,items,at_ms);
 UPDATE private.race_poker_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=dealer RETURNING * INTO m;
 IF m.state->>'phase'='complete' THEN
  PERFORM private.race_poker_settle(dealer);
  SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=dealer;
 END IF;
 receipt_i:=jsonb_build_object('requestId',request,'dealerGameId',dealer,'revision',m.revision,'committedAt',at_ms,'frame',private.race_poker_visible(m.state));
 INSERT INTO private.race_poker_requests(dealer_game_id,request_id,actor,command,receipt) VALUES(dealer,request,actor,command,receipt_i);
 RETURN receipt_i;
END $$;

CREATE OR REPLACE FUNCTION public.race_poker_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 SELECT (p->>'id')::uuid INTO actor FROM private.race_poker_matches m CROSS JOIN LATERAL jsonb_array_elements(m.state->'players')p
 WHERE m.dealer_game_id=p_dealer_game_id AND p->>'userId'=auth.uid()::text AND NOT (p->>'isBot')::boolean;
 RETURN private.race_poker_execute(p_dealer_game_id,p_request_id,p_revision,actor,p_action,p_items,'human');
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_schedule_bot() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL OR NEW.state->>'phase'<>'playing'
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_recover() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE work record;m private.race_poker_matches;at_ms bigint;actor uuid;action_i text;items_i integer[];request_i uuid;n integer:=0;i integer;v jsonb;
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
   IF (m.state->>'deadline')::bigint<=at_ms THEN action_i:='tick';items_i:=NULL;
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
  END LOOP;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION private.race_poker_immutable_match() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.dealer_game_id IS DISTINCT FROM OLD.dealer_game_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.round_id IS DISTINCT FROM OLD.round_id
  OR NEW.stake IS DISTINCT FROM OLD.stake OR NEW.real_money IS DISTINCT FROM OLD.real_money
  OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules' OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players'
  OR NEW.state->'identity' IS DISTINCT FROM OLD.state->'identity' OR NEW.state->'botPolicy' IS DISTINCT FROM OLD.state->'botPolicy' THEN RAISE EXCEPTION 'race_poker:configuration_frozen';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER race_poker_immutable_match BEFORE UPDATE ON private.race_poker_matches FOR EACH ROW EXECUTE FUNCTION private.race_poker_immutable_match();
CREATE TRIGGER race_poker_bot_schedule BEFORE INSERT OR UPDATE ON private.race_poker_matches FOR EACH ROW EXECUTE FUNCTION private.race_poker_schedule_bot();
REVOKE ALL ON FUNCTION private.race_poker_execute(uuid,uuid,bigint,uuid,text,integer[],text),private.race_poker_schedule_bot(),private.race_poker_recover(),private.race_poker_immutable_match(),public.race_poker_action(uuid,uuid,bigint,text,integer[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.race_poker_action(uuid,uuid,bigint,text,integer[]) TO authenticated;
