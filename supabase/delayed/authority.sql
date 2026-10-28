-- Delayed Head-to-Head /1. Candidate only: no production admission or scheduler.
-- Account accounting remains debt-based. No funding, holds or child payouts.
CREATE TABLE private.delayed_release (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 admission_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.delayed_release DEFAULT VALUES;

CREATE TABLE private.delayed_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organizer uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 opponent uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 real_money boolean NOT NULL,
 status text NOT NULL DEFAULT 'invited' CHECK(status IN('invited','active','declined','cancelled','expired','settled')),
 offer jsonb NOT NULL, offer_hash text NOT NULL, policy_version text NOT NULL DEFAULT 'delayed/1',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '72 hours',
 accepted_at timestamptz, settled_at timestamptz,
 revision bigint NOT NULL DEFAULT 0,
 CHECK(organizer<>opponent), CHECK(expires_at>created_at)
);
CREATE TABLE private.delayed_children (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 32),
 game_type text NOT NULL CHECK(game_type IN('run21','tri-towers','ptown-words')),
 stake integer NOT NULL CHECK(stake BETWEEN 1 AND 9999),
 config jsonb NOT NULL,
 starter uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 actor uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 segment bigint NOT NULL DEFAULT 0, revision bigint NOT NULL DEFAULT 0,
 available_at timestamptz, last_call_at timestamptz, expires_at timestamptz,
 started_at timestamptz, gameplay_due_at timestamptz,
 state jsonb, terminal boolean NOT NULL DEFAULT false,
 UNIQUE(match_id,ordinal), UNIQUE(id,match_id),
 CHECK((available_at IS NULL AND last_call_at IS NULL AND expires_at IS NULL) OR
  (available_at IS NOT NULL AND last_call_at IS NOT NULL AND expires_at IS NOT NULL
   AND last_call_at=available_at+interval '24 hours' AND expires_at=available_at+interval '36 hours'))
);
CREATE INDEX delayed_children_due ON private.delayed_children(expires_at) WHERE NOT terminal;
CREATE TABLE private.delayed_outcomes (
 child_id uuid PRIMARY KEY, match_id uuid NOT NULL,
 terminal_revision bigint NOT NULL, segment bigint NOT NULL,
 reason text NOT NULL CHECK(reason IN('normal','timeout_forfeit','draw','void')),
 winner uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 organizer_delta integer NOT NULL, opponent_delta integer NOT NULL,
 evidence jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(child_id,match_id) REFERENCES private.delayed_children(id,match_id) ON DELETE RESTRICT,
 CHECK(organizer_delta+opponent_delta=0),
 CHECK((reason IN('draw','void') AND winner IS NULL AND organizer_delta=0) OR
       (reason IN('normal','timeout_forfeit') AND winner IS NOT NULL AND organizer_delta<>0))
);
CREATE TABLE private.delayed_settlements (
 match_id uuid PRIMARY KEY REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 game_id uuid NOT NULL UNIQUE REFERENCES public.games(id) ON DELETE RESTRICT,
 dealer_game_id uuid NOT NULL UNIQUE REFERENCES public.dealer_games(id) ON DELETE RESTRICT,
 result_id uuid NOT NULL UNIQUE REFERENCES public.game_results(id) ON DELETE RESTRICT,
 outcome_hash text NOT NULL, child_count integer NOT NULL,
 organizer_delta integer NOT NULL, opponent_delta integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(organizer_delta+opponent_delta=0)
);
CREATE TABLE private.delayed_requests (
 actor uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL, fingerprint jsonb NOT NULL,
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 response jsonb NOT NULL, PRIMARY KEY(actor,request_id)
);
CREATE TABLE private.delayed_incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(), closed_at timestamptz,
 reason text NOT NULL, resolution jsonb,
 CHECK(closed_at IS NULL OR closed_at>=opened_at)
);
CREATE TABLE public.platform_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN('invitation','turn','settled','invitation_closed')),
 actionable boolean NOT NULL DEFAULT false, revision bigint NOT NULL DEFAULT 1,
 read_revision bigint NOT NULL DEFAULT 0,
 payload jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,match_id,kind), CHECK(read_revision BETWEEN 0 AND revision)
);
ALTER TABLE public.platform_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_owner ON public.platform_notifications FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.platform_notifications TO authenticated;
REVOKE ALL ON public.platform_notifications FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.platform_notifications FROM authenticated;
CREATE INDEX platform_notifications_user ON public.platform_notifications(user_id,actionable,updated_at DESC);

CREATE FUNCTION private.delayed_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'delayed:immutable_record' USING ERRCODE='42501'; END $$;
CREATE TRIGGER delayed_outcomes_immutable BEFORE UPDATE OR DELETE ON private.delayed_outcomes FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER delayed_settlements_immutable BEFORE UPDATE OR DELETE ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER delayed_requests_immutable BEFORE UPDATE OR DELETE ON private.delayed_requests FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE FUNCTION private.delayed_terms_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='delayed_matches' THEN
  IF (to_jsonb(NEW)-ARRAY['status','accepted_at','settled_at','revision']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','accepted_at','settled_at','revision']) THEN RAISE EXCEPTION 'delayed:frozen_offer'; END IF;
 ELSE
  IF (NEW.id,NEW.match_id,NEW.ordinal,NEW.game_type,NEW.stake,NEW.config) IS DISTINCT FROM
     (OLD.id,OLD.match_id,OLD.ordinal,OLD.game_type,OLD.stake,OLD.config) OR
     (OLD.starter IS NOT NULL AND NEW.starter IS DISTINCT FROM OLD.starter) OR
     (OLD.terminal AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'delayed:frozen_child'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delayed_frozen_offer BEFORE UPDATE ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.delayed_terms_guard();
CREATE TRIGGER delayed_frozen_child BEFORE UPDATE ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.delayed_terms_guard();

CREATE FUNCTION private.delayed_actor(actor uuid) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active)
 THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION private.delayed_held(parent uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL AND (match_id IS NULL OR match_id=parent))
$$;

-- One persistent row per recipient/match/kind. Read state never dismisses action.
CREATE FUNCTION private.delayed_notify(parent uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.delayed_matches; recipient uuid; n integer; earliest timestamptz; urgent boolean; p jsonb; k text; action boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent;
 FOREACH recipient IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT count(*),min(expires_at),coalesce(bool_or(last_call_at<=clock_timestamp()),false)
   INTO n,earliest,urgent FROM private.delayed_children WHERE match_id=m.id AND NOT terminal AND actor=recipient;
  FOREACH k IN ARRAY ARRAY['invitation','turn','settled','invitation_closed'] LOOP
   action:=CASE k WHEN 'invitation' THEN m.status='invited' AND recipient=m.opponent AND clock_timestamp()<m.expires_at
    WHEN 'turn' THEN m.status='active' AND n>0 AND NOT private.delayed_held(m.id) ELSE false END;
   IF k='settled' AND m.status<>'settled' OR k='invitation_closed' AND m.status NOT IN('declined','cancelled','expired') THEN CONTINUE; END IF;
   p:=jsonb_build_object('status',m.status,'opponentId',CASE WHEN recipient=m.organizer THEN m.opponent ELSE m.organizer END,
    'availableCount',CASE WHEN k='turn' AND action THEN n ELSE 0 END,'earliestDeadline',CASE WHEN k='turn' AND action THEN earliest END,
    'lastCall',k='turn' AND action AND urgent,'held',private.delayed_held(m.id));
   INSERT INTO public.platform_notifications(user_id,match_id,kind,actionable,payload)
    VALUES(recipient,m.id,k,action,p)
    ON CONFLICT(user_id,match_id,kind) DO UPDATE SET actionable=EXCLUDED.actionable,payload=EXCLUDED.payload,
     revision=platform_notifications.revision+1,updated_at=clock_timestamp()
    WHERE (platform_notifications.actionable,platform_notifications.payload) IS DISTINCT FROM (EXCLUDED.actionable,EXCLUDED.payload);
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION public.delayed_notification_read(p_id uuid,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.delayed_actor(auth.uid());
 UPDATE public.platform_notifications SET read_revision=greatest(read_revision,least(revision,p_revision))
 WHERE id=p_id AND user_id=auth.uid() AND p_revision>=0;
END $$;

-- A parent only enters canonical session accounting when all children are terminal.
-- Never insert a joinable/live status: WAL subscribers can see each committed
-- change even though ordinary readers see only the final session_ended row.
CREATE FUNCTION private.delayed_finalize(parent uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches; receipt private.delayed_settlements; n integer; completed integer;
 net_i bigint; hash text; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); dg uuid:=gen_random_uuid(); result_id uuid:=gen_random_uuid(); changes jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 SELECT * INTO receipt FROM private.delayed_settlements WHERE match_id=parent;
 IF FOUND THEN RETURN to_jsonb(receipt); END IF;
 IF m.status<>'active' OR private.delayed_held(parent) THEN RAISE EXCEPTION 'delayed:not_settleable'; END IF;
 SELECT count(*) INTO n FROM private.delayed_children WHERE match_id=parent;
 SELECT count(*),coalesce(sum(o.organizer_delta),0),md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY c.ordinal)::text,''))
  INTO completed,net_i,hash FROM private.delayed_children c JOIN private.delayed_outcomes o ON o.child_id=c.id AND o.match_id=c.match_id
  WHERE c.match_id=parent AND c.terminal;
 IF n=0 OR n<>jsonb_array_length(m.offer) OR completed<>n THEN RETURN NULL; END IF;
 IF abs(net_i)>2147483647 THEN RAISE EXCEPTION 'delayed:amount_overflow'; END IF;
 INSERT INTO public.games(id,name,game_type,status,current_host,real_money,pot,buy_in)
  VALUES(parent,'Delayed Head-to-Head','delayed-head-to-head','game_over',m.organizer,m.real_money,0,0);
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config)
  VALUES(dg,parent,m.organizer,'delayed-head-to-head',jsonb_build_object('offerHash',m.offer_hash,'policy',m.policy_version));
 UPDATE public.games SET current_game_uuid=dg WHERE id=parent;
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot,sitting_out,waiting)
  VALUES(a,parent,m.organizer,1,0,'active',false,false,false),(b,parent,m.opponent,2,0,'active',false,false,false);
 changes:=jsonb_build_object(a::text,net_i,b::text,-net_i);
 INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,
  winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(result_id,parent,dg,1,'delayed_parent','delayed-head-to-head',CASE WHEN net_i>0 THEN a WHEN net_i<0 THEN b END,
  CASE WHEN net_i=0 THEN 'Tie' ELSE (SELECT username FROM public.profiles WHERE id=CASE WHEN net_i>0 THEN m.organizer ELSE m.opponent END) END,
  'Delayed match aggregate',abs(net_i)::integer,changes,net_i=0);
 IF net_i<>0 THEN
  PERFORM public.settle_gameplay_chip_transfers(parent,jsonb_build_array(jsonb_build_object(
   'from',jsonb_build_object('kind','player','playerId',CASE WHEN net_i>0 THEN b ELSE a END),
   'to',jsonb_build_object('kind','player','playerId',CASE WHEN net_i>0 THEN a ELSE b END),'amount',abs(net_i)::integer)),'win');
 END IF;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
 SELECT parent,dg,1,p.id,p.user_id,pr.username,p.chips,false FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=parent;
 -- record_session_results owns account posting from these final snapshots.
 UPDATE public.games SET status='session_ended',session_ended_at=clock_timestamp(),game_over_at=clock_timestamp(),pending_session_end=false WHERE id=parent;
 IF m.real_money AND ((SELECT count(*) FROM public.player_transactions WHERE source_game_id=parent AND transaction_type='SessionResult')<>2
  OR NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=parent AND profile_id=m.organizer AND transaction_type='SessionResult' AND player_transactions.amount=net_i)
  OR NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=parent AND profile_id=m.opponent AND transaction_type='SessionResult' AND player_transactions.amount=-net_i))
 THEN RAISE EXCEPTION 'delayed:account_posting_mismatch'; END IF;
 INSERT INTO private.delayed_settlements(match_id,game_id,dealer_game_id,result_id,outcome_hash,child_count,organizer_delta,opponent_delta)
 VALUES(parent,parent,dg,result_id,hash,n,net_i,-net_i) RETURNING * INTO receipt;
 UPDATE private.delayed_matches SET status='settled',settled_at=clock_timestamp(),revision=revision+1 WHERE id=parent;
 PERFORM private.delayed_notify(parent);
 RETURN to_jsonb(receipt);
END $$;

-- Called only by qualified private adapters. Never grant this to service/API roles.
CREATE FUNCTION private.delayed_record_outcome(child uuid,expected_revision bigint,reason_i text,winner_i uuid,evidence_i jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c private.delayed_children; m private.delayed_matches; old private.delayed_outcomes; delta_i integer;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 SELECT * INTO old FROM private.delayed_outcomes WHERE child_id=child;
 IF FOUND THEN
  IF (old.terminal_revision,old.reason,old.winner,old.evidence) IS DISTINCT FROM (expected_revision,reason_i,winner_i,evidence_i)
  THEN RAISE EXCEPTION 'delayed:outcome_conflict'; END IF;
  RETURN to_jsonb(old);
 END IF;
 IF m.status<>'active' OR c.terminal OR c.revision IS DISTINCT FROM expected_revision OR private.delayed_held(m.id)
 THEN RAISE EXCEPTION 'delayed:stale_outcome'; END IF;
 IF reason_i IS NULL OR reason_i NOT IN('normal','timeout_forfeit','draw','void') OR evidence_i IS NULL
 OR (reason_i IN('normal','timeout_forfeit') AND (winner_i IS NULL OR winner_i NOT IN(m.organizer,m.opponent)))
 OR (reason_i IN('draw','void') AND winner_i IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_outcome'; END IF;
 delta_i:=CASE WHEN winner_i=m.organizer THEN c.stake WHEN winner_i=m.opponent THEN -c.stake ELSE 0 END;
 INSERT INTO private.delayed_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i) RETURNING * INTO old;
 UPDATE private.delayed_children SET terminal=true,revision=revision+1 WHERE id=c.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_finalize(m.id);
 PERFORM private.delayed_notify(m.id);
 RETURN to_jsonb(old);
END $$;

-- No public winner/amount arguments. Exact-generation expiry only.
CREATE FUNCTION private.delayed_expire(child uuid,expected_segment bigint,expected_expiry timestamptz) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
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
END $$;

CREATE FUNCTION public.delayed_create(p_request uuid,p_opponent uuid,p_real_money boolean,p_lineup jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF actor_i=p_opponent OR p_real_money IS NULL OR jsonb_typeof(p_lineup) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineup)<>1 OR p_real_money
 THEN RAISE EXCEPTION 'delayed:invalid_offer'; END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lineup) LOOP
  IF coalesce(item->>'game','')<>'ptown-words' OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  cfg:=private.ptown_words_rules_for('ptown-words/3');
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
END $$;

CREATE FUNCTION public.delayed_respond(p_match uuid,p_request uuid,p_offer_hash text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
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
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF m.real_money OR c.game_type<>'ptown-words' OR (SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
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
END $$;

-- Default-deny every new private owner, including trusted HTTP/worker roles.
REVOKE ALL ON private.delayed_release,private.delayed_matches,private.delayed_children,private.delayed_outcomes,
 private.delayed_settlements,private.delayed_requests,private.delayed_incidents FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.delayed_immutable(),private.delayed_terms_guard(),private.delayed_actor(uuid),private.delayed_held(uuid),
 private.delayed_notify(uuid),private.delayed_finalize(uuid),private.delayed_record_outcome(uuid,bigint,text,uuid,jsonb),
 private.delayed_expire(uuid,bigint,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.delayed_create(uuid,uuid,boolean,jsonb),public.delayed_respond(uuid,uuid,text,text),public.delayed_notification_read(uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_create(uuid,uuid,boolean,jsonb),public.delayed_respond(uuid,uuid,text,text),public.delayed_notification_read(uuid,bigint) TO authenticated;
