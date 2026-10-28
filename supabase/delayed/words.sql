-- Async Words owns orchestration only. Shared /3 rules own every legal move.
CREATE TABLE private.delayed_word_commands (
 actor uuid NOT NULL, request_id uuid NOT NULL, child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 fingerprint jsonb NOT NULL, response jsonb NOT NULL, PRIMARY KEY(actor,request_id)
);
ALTER TABLE private.delayed_word_commands ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER delayed_word_commands_immutable BEFORE UPDATE OR DELETE ON private.delayed_word_commands FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TABLE private.delayed_words_health(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,last_tick timestamptz);
INSERT INTO private.delayed_words_health DEFAULT VALUES;
ALTER TABLE private.delayed_words_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_word_commands,private.delayed_words_health FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.delayed_words_view(child uuid,viewer uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;receipt private.delayed_settlements;s jsonb;held boolean;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 IF viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent) OR m.status NOT IN('active','settled') OR c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
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
END $$;

CREATE FUNCTION public.delayed_words_snapshot(p_child uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();
BEGIN
 PERFORM private.delayed_actor(who);
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) AND who IN(organizer,opponent) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 -- Read may catch up an overdue turn; it never creates a fresh availability window.
 IF NOT c.terminal AND NOT private.delayed_held(m.id) THEN PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);END IF;
 RETURN private.delayed_words_view(p_child,who);
END $$;

CREATE FUNCTION public.delayed_words_action(p_child uuid,p_request uuid,p_revision bigint,p_action text,p_items jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid();c private.delayed_children;m private.delayed_matches;prior private.delayed_word_commands;
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'action',p_action,'items',p_items);s jsonb;answer jsonb;at_time timestamptz;at_ms bigint;winner uuid;rejection text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM pg_advisory_xact_lock_shared(731907241);
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
END $$;

CREATE FUNCTION private.delayed_words_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches;c private.delayed_children;n integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
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
   IF private.delayed_expire(c.id,c.segment,c.expires_at) THEN n:=n+1;END IF;
  END LOOP;
  PERFORM private.delayed_notify(m.id);
 END LOOP;
 UPDATE private.delayed_words_health SET last_tick=clock_timestamp() WHERE singleton;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.delayed_words_view(uuid,uuid),private.delayed_words_recover(),public.delayed_words_snapshot(uuid),public.delayed_words_action(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_words_snapshot(uuid),public.delayed_words_action(uuid,uuid,bigint,text,jsonb) TO authenticated;
-- Scheduler and admission stay disabled until exact-source publication is verified.
