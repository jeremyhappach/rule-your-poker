-- One parent correction can revive several children without disturbing completed siblings.
CREATE TABLE private.delayed_timeout_restored_children(
 correction_id uuid NOT NULL REFERENCES private.delayed_corrections(id) DEFERRABLE INITIALLY DEFERRED,
 child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 before_child jsonb NOT NULL,restored_child jsonb NOT NULL,original_outcome jsonb NOT NULL,
 PRIMARY KEY(correction_id,child_id));
CREATE INDEX delayed_timeout_restored_child ON private.delayed_timeout_restored_children(child_id);
ALTER TABLE private.delayed_timeout_restored_children ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_timeout_restored_children FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delayed_timeout_restored_immutable BEFORE UPDATE OR DELETE ON private.delayed_timeout_restored_children
 FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();

CREATE OR REPLACE VIEW private.delayed_current_outcomes AS
 SELECT o.* FROM private.delayed_outcomes o WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.child_id=o.child_id)
 AND NOT EXISTS(SELECT FROM private.delayed_timeout_restored_children x WHERE x.child_id=o.child_id)
 UNION ALL
 SELECT o.child_id,o.match_id,o.terminal_revision,o.segment,o.reason,o.winner,o.organizer_delta,o.opponent_delta,o.evidence,o.completed_at
 FROM private.delayed_reopened_outcomes o JOIN private.delayed_current_corrections x ON x.match_id=o.match_id AND x.generation=o.generation;
CREATE OR REPLACE VIEW private.delayed_current_review_events AS
 SELECT e.* FROM private.delayed_review_events e WHERE e.kind<>'child' OR (
 NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.child_id=e.child_id AND e.completed_at<x.created_at)
 AND NOT EXISTS(SELECT FROM private.delayed_timeout_restored_children r JOIN private.delayed_corrections x ON x.id=r.correction_id WHERE r.child_id=e.child_id AND e.completed_at<x.created_at));

DO $patch$ DECLARE src text;needle text;BEGIN
 src:=pg_get_functiondef('private.delayed_terms_guard()'::regprocedure);
 needle:='x.before_child=to_jsonb(OLD) AND x.restored_child=to_jsonb(NEW)))';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'timeout72:guard_preimage';END IF;
 src:=replace(src,needle,'x.before_child=to_jsonb(OLD) AND x.restored_child=to_jsonb(NEW)) AND NOT EXISTS(SELECT FROM private.delayed_timeout_restored_children r JOIN private.delayed_corrections x ON x.id=r.correction_id WHERE r.child_id=OLD.id AND x.transaction_id=txid_current() AND x.executor_role=session_user AND r.before_child=to_jsonb(OLD) AND r.restored_child=to_jsonb(NEW)))');
 EXECUTE src;
 src:=pg_get_functiondef('private.delayed_record_outcome(uuid,bigint,text,uuid,jsonb)'::regprocedure);
 needle:='SELECT FROM private.delayed_current_corrections WHERE child_id=child';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'timeout72:outcome_preimage';END IF;
 src:=replace(src,needle,'SELECT FROM private.delayed_current_corrections WHERE match_id=c.match_id');
 src:=replace(src,'SELECT generation FROM private.delayed_current_corrections WHERE child_id=child','SELECT generation FROM private.delayed_current_corrections WHERE match_id=c.match_id');
 EXECUTE src;
END $patch$;

CREATE FUNCTION public.admin_restore_async_availability(p_request uuid,p_match uuid,p_revision bigint,p_children jsonb,p_reason text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches;c private.delayed_children;restored private.delayed_children;o private.delayed_outcomes;s private.delayed_settlements;
 prior private.delayed_corrections;who uuid:=auth.uid();fp jsonb;item jsonb;at_i timestamptz:=clock_timestamp();at_ms bigint;
 generation_i int;financial_id uuid:=gen_random_uuid();reversals uuid[]:='{}';entry public.player_transactions;reversal jsonb;
 pa public.players;pb public.players;first_c jsonb;first_r jsonb;first_o jsonb;first_id uuid;alert_user uuid;episode bigint;event_id uuid;ks text[];
BEGIN
 IF who IS NULL OR NOT public.has_role(who,'admin'::public.app_role) THEN RAISE EXCEPTION 'async_restore:not_authorized' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_revision IS NULL OR jsonb_typeof(p_children) IS DISTINCT FROM 'array' OR jsonb_array_length(p_children) NOT BETWEEN 1 AND 32 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 2000 THEN RAISE EXCEPTION 'async_restore:request';END IF;
 fp:=jsonb_build_object('match',p_match,'revision',p_revision,'children',p_children,'reason',p_reason);
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO prior FROM private.delayed_corrections WHERE id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM who OR prior.fingerprint IS DISTINCT FROM fp THEN RAISE EXCEPTION 'async_restore:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','already_restored','correction',p_request,'reversalIds',prior.reversal_ids);
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF m.revision<>p_revision OR m.status NOT IN('active','settled') OR private.delayed_held(m.id) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'async_restore:parent_changed';END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_children))<>jsonb_array_length(p_children) THEN RAISE EXCEPTION 'async_restore:duplicate_child';END IF;
 PERFORM 1 FROM private.delayed_children WHERE match_id=m.id ORDER BY id FOR UPDATE;
 -- Validate every exact receipt before any reversal or restoration.
 FOR item IN SELECT value FROM jsonb_array_elements(p_children) LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid AND match_id=m.id;
  SELECT * INTO STRICT o FROM private.delayed_current_outcomes WHERE child_id=c.id;
  IF NOT c.terminal OR c.revision IS DISTINCT FROM (item->>'revision')::bigint OR md5(to_jsonb(o)::text) IS DISTINCT FROM item->>'outcomeHash'
   OR o.reason<>'timeout_forfeit' OR c.started_at IS NOT NULL OR c.gameplay_due_at IS NOT NULL OR c.expires_at IS DISTINCT FROM c.available_at+interval '36 hours'
   OR NOT(coalesce((o.evidence->>'expiredAt')::timestamptz=c.expires_at,false) OR (c.game_type='chess' AND c.state->>'opened'='false' AND c.state->>'reason'='timeout' AND abs((c.state->>'deadline')::bigint-extract(epoch FROM c.expires_at)*1000)<1000))
   THEN RAISE EXCEPTION 'async_restore:child_evidence_changed';END IF;
 END LOOP;
 SELECT coalesce(max(generation),0)+1 INTO generation_i FROM private.delayed_corrections WHERE match_id=m.id;
 SELECT * INTO s FROM private.delayed_current_settlements WHERE match_id=m.id;
 IF m.status='settled' THEN
  IF s.match_id IS NULL THEN RAISE EXCEPTION 'async_restore:settlement_missing';END IF;
  SELECT * INTO STRICT pa FROM public.players WHERE game_id=s.game_id AND user_id=m.organizer AND NOT is_bot FOR UPDATE;
  SELECT * INTO STRICT pb FROM public.players WHERE game_id=s.game_id AND user_id=m.opponent AND NOT is_bot FOR UPDATE;
  IF pa.chips<>s.organizer_delta OR pb.chips<>s.opponent_delta THEN RAISE EXCEPTION 'async_restore:balance_mismatch';END IF;
  IF m.real_money THEN
   IF (SELECT count(*) FROM public.player_transactions WHERE source_game_id=s.game_id AND transaction_type='SessionResult')<>2 THEN RAISE EXCEPTION 'async_restore:posting_count';END IF;
   FOR entry IN SELECT * FROM public.player_transactions WHERE source_game_id=s.game_id AND transaction_type='SessionResult' ORDER BY id FOR UPDATE LOOP
    IF entry.amount<>(CASE WHEN entry.profile_id=m.organizer THEN s.organizer_delta WHEN entry.profile_id=m.opponent THEN s.opponent_delta ELSE NULL END)
     OR entry.profile_id NOT IN(m.organizer,m.opponent) OR EXISTS(SELECT FROM public.player_transactions WHERE reversal_of=entry.id) THEN RAISE EXCEPTION 'async_restore:posting_mismatch';END IF;
    reversal:=public.admin_reverse_account_entry(gen_random_uuid(),entry.id,p_reason);reversals:=array_append(reversals,(reversal->>'id')::uuid);
   END LOOP;
  END IF;
  IF s.organizer_delta<>0 THEN
   PERFORM public.settle_gameplay_chip_transfers(s.game_id,jsonb_build_array(jsonb_build_object(
    'from',jsonb_build_object('kind','player','playerId',CASE WHEN s.organizer_delta>0 THEN pa.id ELSE pb.id END),
    'to',jsonb_build_object('kind','player','playerId',CASE WHEN s.organizer_delta>0 THEN pb.id ELSE pa.id END),'amount',abs(s.organizer_delta))),'transfer');
  END IF;
  IF EXISTS(SELECT FROM public.players WHERE id IN(pa.id,pb.id) AND chips<>0) THEN RAISE EXCEPTION 'async_restore:reversal_balance';END IF;
 ELSIF s.match_id IS NOT NULL THEN RAISE EXCEPTION 'async_restore:unexpected_settlement';END IF;
 at_ms:=floor(extract(epoch FROM at_i)*1000);
 FOR item IN SELECT value FROM jsonb_array_elements(p_children) LOOP
  SELECT * INTO c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  SELECT * INTO o FROM private.delayed_current_outcomes WHERE child_id=c.id;
  restored:=c;restored.terminal:=false;restored.revision:=c.revision+1;restored.segment:=c.segment+1;
  restored.available_at:=at_i;restored.last_call_at:=at_i+interval '48 hours';restored.expires_at:=at_i+interval '72 hours';restored.started_at:=NULL;restored.gameplay_due_at:=NULL;
  IF c.game_type='chess' THEN restored.state:=(c.state-ARRAY['reason','terminal','movePresentation'])||jsonb_build_object('phase','playing','winnerIds','[]'::jsonb,'scores',jsonb_build_object(m.organizer::text,0,m.opponent::text,0),'deadline',at_ms+259200000,'clockDuration',259200000,'opened',false);
  ELSIF c.game_type='ptown-words' AND c.config->>'version'='ptown-words/3' THEN restored.state:=jsonb_set(c.state,'{deadline}',to_jsonb(at_ms+259200000));END IF;
  IF first_id IS NULL THEN first_id:=c.id;first_c:=to_jsonb(c);first_r:=to_jsonb(restored);first_o:=to_jsonb(o);END IF;
  INSERT INTO private.delayed_timeout_restored_children VALUES(p_request,c.id,to_jsonb(c),to_jsonb(restored),to_jsonb(o));
 END LOOP;
 INSERT INTO private.delayed_corrections(id,child_id,match_id,actor,reason,fingerprint,before_child,restored_child,before_parent,original_outcome,original_settlement,reversal_ids,financial_game_id,transaction_id,executor_role,created_at,generation)
 VALUES(p_request,first_id,m.id,who,p_reason,fp,first_c,first_r,to_jsonb(m),first_o,coalesce(to_jsonb(s),'{}'::jsonb),reversals,financial_id,txid_current(),session_user,at_i,generation_i);
 FOR item IN SELECT restored_child FROM private.delayed_timeout_restored_children WHERE correction_id=p_request LOOP
  restored:=jsonb_populate_record(NULL::private.delayed_children,item);
  UPDATE private.delayed_children SET state=restored.state,terminal=false,revision=restored.revision,segment=restored.segment,available_at=restored.available_at,last_call_at=restored.last_call_at,expires_at=restored.expires_at,started_at=NULL,gameplay_due_at=NULL WHERE id=restored.id;
 END LOOP;
 UPDATE private.delayed_matches SET status='active',settled_at=NULL,revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_notify(m.id);
 PERFORM private.push_sync(m.id);
 -- The owner explicitly requested a renewed-turn alert, even if another turn was already available.
 FOR alert_user IN SELECT DISTINCT (restored_child->>'actor')::uuid FROM private.delayed_timeout_restored_children WHERE correction_id=p_request LOOP
  IF NOT EXISTS(SELECT FROM private.push_events WHERE match_id=m.id AND user_id=alert_user AND kind='turn' AND created_at>=at_i) THEN
   UPDATE private.push_episodes SET epoch=epoch+1,turn_epoch=epoch+1 WHERE match_id=m.id AND user_id=alert_user RETURNING epoch,keys INTO episode,ks;
   INSERT INTO private.push_events(match_id,user_id,epoch,kind,keys) VALUES(m.id,alert_user,episode,'turn',ks) RETURNING id INTO event_id;
   INSERT INTO private.push_deliveries(event_id,subscription_id,binding) SELECT event_id,sub.id,sub.binding FROM private.push_subscriptions sub JOIN private.push_match_preferences pref ON pref.user_id=sub.user_id AND pref.match_id=m.id WHERE sub.user_id=alert_user AND NOT sub.disabled AND pref.enabled;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('outcome','restored','correction',p_request,'match',m.id,'children',jsonb_array_length(p_children),'reversalIds',reversals,'expiresAt',at_i+interval '72 hours');
END $$;
REVOKE ALL ON FUNCTION public.admin_restore_async_availability(uuid,uuid,bigint,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_async_availability(uuid,uuid,bigint,jsonb,text) TO authenticated;
