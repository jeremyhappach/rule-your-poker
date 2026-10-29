-- APPROVED combined candidate. Not installed. Multi-game admission remains closed.
DO $guard$ BEGIN
 IF md5(replace(pg_get_functiondef('private.delayed_actor(uuid)'::regprocedure),chr(13),'')) IS DISTINCT FROM '367c7685397fa5bfe75adbcff7c3f1a9' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_actor';END IF;
 IF md5(replace(pg_get_functiondef('private.delayed_finalize(uuid)'::regprocedure),chr(13),'')) IS DISTINCT FROM '3c319dee938f4242d6174b27bc3ff260' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_finalize';END IF;
 IF md5(replace(pg_get_functiondef('private.delayed_incident_close(uuid, text)'::regprocedure),chr(13),'')) IS DISTINCT FROM '84660a99f34cf59b23d35f89f91862b0' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_incident_close';END IF;
 IF md5(replace(pg_get_functiondef('private.delayed_notify(uuid)'::regprocedure),chr(13),'')) IS DISTINCT FROM 'eedaea0742e9ad1a861a0c1cc2fdb62f' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_notify';END IF;
 IF md5(replace(pg_get_functiondef('private.delayed_words_recover()'::regprocedure),chr(13),'')) IS DISTINCT FROM '0bea6d49a832306f8bf4ab16bd54ef31' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_words_recover';END IF;
 IF md5(replace(pg_get_functiondef('private.delayed_words_view(uuid, uuid)'::regprocedure),chr(13),'')) IS DISTINCT FROM '0d7bf331a8d61f638f61eaf093c07573' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_words_view';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_capabilities()'::regprocedure),chr(13),'')) IS DISTINCT FROM '19e462d8bcace499dd9aa65d311f4f85' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_capabilities';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_create(uuid, uuid, boolean, jsonb)'::regprocedure),chr(13),'')) IS DISTINCT FROM '2b0fbdd1d65d8019af99e8979769927a' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_create';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_home(uuid)'::regprocedure),chr(13),'')) IS DISTINCT FROM '4dafef74362a47ee946199f210538424' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_home';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_list(timestamp with time zone, uuid)'::regprocedure),chr(13),'')) IS DISTINCT FROM 'b956fd4beae9a3eeda16f54da8d10b40' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_list';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_opponent_page(text, text, jsonb)'::regprocedure),chr(13),'')) IS DISTINCT FROM '26f26407308d3555832b3819763e2fa2' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_opponent_page';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_opponents(text)'::regprocedure),chr(13),'')) IS DISTINCT FROM '0421e7352719124831017a8137ee95c2' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_opponents';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_respond(uuid, uuid, text, text)'::regprocedure),chr(13),'')) IS DISTINCT FROM '5677cabaa5fe48c9081de01ce056f258' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_respond';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_words_snapshot(uuid)'::regprocedure),chr(13),'')) IS DISTINCT FROM '3300adb557e38cf369d12df215a85b0b' THEN RAISE EXCEPTION 'async_combined:authority_changed delayed_words_snapshot';END IF;
 IF md5(replace(pg_get_functiondef('public.finalize_gameplay_transfer_batch()'::regprocedure),chr(13),'')) IS DISTINCT FROM '5d1c8703caee40ce7392d4eb6de1aaf9' THEN RAISE EXCEPTION 'async_combined:authority_changed finalize_gameplay_transfer_batch';END IF;
 IF md5(replace(pg_get_functiondef('public.platform_notification_center()'::regprocedure),chr(13),'')) IS DISTINCT FROM '224189a3a1991b170fd23b3a223b99ed' THEN RAISE EXCEPTION 'async_combined:authority_changed platform_notification_center';END IF;
 IF md5(replace(pg_get_functiondef('public.record_session_results()'::regprocedure),chr(13),'')) IS DISTINCT FROM 'eb408dcb7dca842776909bd603183a60' THEN RAISE EXCEPTION 'async_combined:authority_changed record_session_results';END IF;
 IF md5(replace(pg_get_functiondef('public.settle_gameplay_chip_transfers(uuid, jsonb, text)'::regprocedure),chr(13),'')) IS DISTINCT FROM '86c0feb55524f14ab9f58a06cdee2ef6' THEN RAISE EXCEPTION 'async_combined:authority_changed settle_gameplay_chip_transfers';END IF;
END $guard$;

-- Isolated combined-release candidate. No hosted installation or activation.
-- Canonical session bots have a profile/seat but no auth.users identity.
-- Use UUID identity, never a display-name or user-editable metadata heuristic.
CREATE OR REPLACE FUNCTION private.delayed_human(actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=actor AND p.is_active)
$$;
REVOKE ALL ON FUNCTION private.delayed_human(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.delayed_actor(actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF actor IS NULL OR NOT private.delayed_human(actor)
 THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.delayed_actor(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.delayed_opponent_page(p_search text DEFAULT '',p_sort text DEFAULT 'username',p_after jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;needle text:=lower(trim(coalesce(p_search,'')));
BEGIN
 PERFORM private.delayed_actor(auth.uid());
 IF length(needle)>80 OR p_sort NOT IN('username','recent') THEN RAISE EXCEPTION 'delayed:invalid_filter';END IF;
 IF p_after IS NOT NULL AND (p_after->>'sort' IS DISTINCT FROM p_sort OR p_after->>'search' IS DISTINCT FROM needle) THEN RAISE EXCEPTION 'delayed:invalid_cursor';END IF;
 WITH candidates AS (
  SELECT p.id,p.username,lower(p.username) name_key,
   (SELECT max(greatest(m.settled_at,m.accepted_at,
     (SELECT max(to_timestamp((cmd.response->>'serverAt')::double precision/1000))
      FROM private.delayed_children c JOIN private.delayed_word_commands cmd ON cmd.child_id=c.id
      WHERE c.match_id=m.id AND NOT cmd.response?'error'))) FROM private.delayed_matches m
    WHERE m.accepted_at IS NOT NULL AND (m.organizer=auth.uid() AND m.opponent=p.id OR m.opponent=auth.uid() AND m.organizer=p.id)) last_played
  FROM public.profiles p WHERE private.delayed_human(p.id) AND p.id<>auth.uid() AND position(needle IN lower(p.username))>0
 ), keyed AS (
  SELECT *,CASE WHEN p_sort='recent' THEN -coalesce(extract(epoch FROM last_played),0) ELSE 0 END time_key FROM candidates
 ), page AS (
  SELECT * FROM keyed WHERE p_after IS NULL OR (time_key,name_key,id)>((p_after->>'time')::numeric,p_after->>'name',(p_after->>'id')::uuid)
  ORDER BY time_key,name_key,id LIMIT 51
 ), visible AS (SELECT * FROM page ORDER BY time_key,name_key,id LIMIT 50)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',username,'isHuman',true) ORDER BY time_key,name_key,id) FROM visible),'[]'::jsonb),
  'hasMore',(SELECT count(*)>50 FROM page),'next',CASE WHEN (SELECT count(*)>50 FROM page) THEN
   (SELECT jsonb_build_object('time',time_key::text,'name',name_key,'id',id,'sort',p_sort,'search',needle) FROM visible ORDER BY time_key DESC,name_key DESC,id DESC LIMIT 1) END) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.delayed_opponent_page(text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_opponent_page(text,text,jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.delayed_opponents(p_search text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',username) ORDER BY username),'[]'::jsonb)
 FROM (SELECT id,username FROM public.profiles WHERE private.delayed_human(auth.uid()) AND private.delayed_human(id) AND id<>auth.uid()
  AND length(trim(p_search)) BETWEEN 2 AND 80 AND position(lower(trim(p_search)) IN lower(username))>0 ORDER BY username,id LIMIT 20) p
$$;


-- Recoverable creator-only removal. Never delete child/history/financial rows.
CREATE TABLE private.delayed_removals (
 match_id uuid PRIMARY KEY REFERENCES private.delayed_matches(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),request_id uuid NOT NULL,
 prior_status text NOT NULL,removed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.delayed_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_removals FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delayed_removals_immutable BEFORE UPDATE OR DELETE ON private.delayed_removals
 FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();

CREATE FUNCTION public.delayed_remove(p_match uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid();m private.delayed_matches;r private.delayed_requests;
 fingerprint jsonb:=jsonb_build_object('op','remove','match',p_match);answer jsonb;at_time timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_request::text,317));
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF NOT FOUND OR m.organizer IS DISTINCT FROM who OR m.real_money IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'delayed:remove_denied' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM private.delayed_requests WHERE actor=who AND request_id=p_request;
 IF FOUND THEN
  IF r.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;
  RETURN r.response;
 END IF;
 SELECT removed_at INTO at_time FROM private.delayed_removals WHERE match_id=m.id;
 IF NOT FOUND THEN
  INSERT INTO private.delayed_removals(match_id,actor,request_id,prior_status)
   VALUES(m.id,who,p_request,m.status) RETURNING removed_at INTO at_time;
  -- A settled match retains its canonical receipt/status; no reversal or new payout.
  UPDATE private.delayed_matches SET status=CASE WHEN status IN('invited','active') THEN 'cancelled' ELSE status END,
   revision=revision+1 WHERE id=m.id;
  UPDATE public.platform_notifications SET actionable=false,read_revision=revision+1,
   revision=revision+1,updated_at=at_time,payload=payload||jsonb_build_object('removed',true)
   WHERE match_id=m.id;
 END IF;
 answer:=jsonb_build_object('id',m.id,'removedAt',at_time);
 INSERT INTO private.delayed_requests VALUES(who,p_request,fingerprint,m.id,answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.delayed_remove(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_remove(uuid,uuid) TO authenticated;

-- Patch only the existing projections/notification owner, with exact anchors.
DO $$ DECLARE source_i text;old_i text;new_i text;signature_i text;BEGIN
 FOR signature_i,old_i,new_i IN SELECT * FROM (VALUES
 ('public.delayed_list(timestamp with time zone,uuid)',
  'WHERE auth.uid() IN(organizer,opponent)',
  'WHERE NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=delayed_matches.id) AND auth.uid() IN(organizer,opponent)'),
 ('public.delayed_home(uuid)',
  '''serverAt'',floor(extract(epoch FROM clock_timestamp())*1000)',
  '''removedAt'',(SELECT removed_at FROM private.delayed_removals WHERE match_id=m.id),''serverAt'',floor(extract(epoch FROM clock_timestamp())*1000)'),
 ('private.delayed_words_view(uuid,uuid)',
  'IF viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent)',
  'IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) OR viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent)'),
 ('private.delayed_notify(uuid)',
  'FOREACH recipient IN ARRAY ARRAY[m.organizer,m.opponent] LOOP',
  'IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RETURN;END IF; FOREACH recipient IN ARRAY ARRAY[m.organizer,m.opponent] LOOP')
 ) p(signature_i,old_i,new_i) LOOP
  source_i:=pg_get_functiondef(signature_i::regprocedure);
  IF (length(source_i)-length(replace(source_i,old_i,'')))/length(old_i)<>1 THEN RAISE EXCEPTION 'delayed:removal_source_changed %',signature_i;END IF;
  EXECUTE replace(source_i,old_i,new_i);
 END LOOP;
 source_i:=pg_get_functiondef('public.platform_notification_center()'::regprocedure);
 old_i:='WHERE user_id=auth.uid()';
 IF (length(source_i)-length(replace(source_i,old_i,'')))/length(old_i)<>2 THEN RAISE EXCEPTION 'delayed:notification_source_changed';END IF;
 EXECUTE replace(source_i,old_i,'WHERE NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=platform_notifications.match_id) AND user_id=auth.uid()');
END $$;


-- Trusted server adapter boundary. Browser roles never submit state or results.
DO $$ DECLARE source_i text;old_i text;BEGIN
 source_i:=pg_get_functiondef('public.delayed_words_snapshot(uuid)'::regprocedure);
 old_i:='-- Read may catch up an overdue turn;';
 IF position(old_i IN source_i)=0 THEN RAISE EXCEPTION 'delayed:snapshot_source_changed';END IF;
 EXECUTE replace(source_i,old_i,'IF c.game_type<>''ptown-words'' OR m.real_money THEN RAISE EXCEPTION ''delayed:scope_closed'';END IF; '||old_i);
END $$;
CREATE TABLE private.delayed_commands (
 actor uuid NOT NULL, request_id uuid NOT NULL, child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 fingerprint jsonb NOT NULL, revision bigint NOT NULL, PRIMARY KEY(actor,request_id)
);
ALTER TABLE private.delayed_commands ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER delayed_commands_immutable BEFORE UPDATE OR DELETE ON private.delayed_commands FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
REVOKE ALL ON private.delayed_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_tri_core(p_operation text,p_config jsonb DEFAULT NULL,p_score bigint DEFAULT 0,
 p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,p_index integer DEFAULT NULL,p_at bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 CASE p_operation
 WHEN 'deal' THEN RETURN private.tri_towers_board_deal(jsonb_build_object('rules',p_config,'score',p_score),p_at);
 WHEN 'reduce' THEN RETURN private.tri_towers_board_reduce(p_board,p_action,p_index,p_at);
 WHEN 'visible' THEN RETURN private.tri_towers_visible(p_board)-ARRAY['activePlayerId','cursor'];
 WHEN 'eligible' THEN RETURN to_jsonb(private.tri_towers_bonus_qualified_v2(p_score,p_config));
 ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';
 END CASE;
END $$;

CREATE FUNCTION private.delayed_child_record(c private.delayed_children) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(c)||jsonb_build_object('organizer',m.organizer,'opponent',m.opponent,
  'status',m.status,'held',private.delayed_held(m.id),'server_at',floor(extract(epoch FROM clock_timestamp())*1000),
  'outcome',(SELECT jsonb_build_object('winner',o.winner,'reason',o.reason,'organizer_delta',o.organizer_delta,'opponent_delta',o.opponent_delta)
   FROM private.delayed_outcomes o WHERE o.child_id=c.id))
 FROM private.delayed_matches m WHERE m.id=c.match_id
$$;

CREATE FUNCTION public.delayed_load(p_child uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $$;

CREATE FUNCTION public.delayed_commit(p_child uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_event text,p_at bigint,
 p_advanced boolean,p_request uuid DEFAULT NULL,p_fingerprint jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
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
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
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
END $$;

REVOKE ALL ON FUNCTION private.delayed_child_record(private.delayed_children) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.delayed_tri_core(text,jsonb,bigint,jsonb,text,integer,bigint),
 public.delayed_load(uuid,uuid,uuid),public.delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_tri_core(text,jsonb,bigint,jsonb,text,integer,bigint),
 public.delayed_load(uuid,uuid,uuid),public.delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb) TO service_role;


-- Trusted adapter calls only: existing shared reducers retain rules/randomness.
CREATE FUNCTION public.delayed_board_core(p_game text,p_operation text,p_config jsonb DEFAULT NULL,
 p_score bigint DEFAULT 0,p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,
 p_items integer[] DEFAULT NULL,p_at bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb;
BEGIN
 IF p_game='quintzee' THEN
  CASE p_operation
  WHEN 'deal' THEN
   b:=private.quintzee_board_deal(jsonb_build_object('rules',p_config,'score',p_score),p_at);
   -- Begin round is the player's explicit Start; use the unchanged Start reducer.
   RETURN private.quintzee_board_reduce(b,'start',ARRAY[]::integer[],p_at);
  WHEN 'reduce' THEN RETURN private.quintzee_board_reduce(p_board,p_action,p_items,p_at);
  WHEN 'visible' THEN RETURN private.quintzee_present_board(p_board);
  WHEN 'rounds' THEN RETURN to_jsonb(private.quintzee_required_rounds(p_score));
  ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';END CASE;
 ELSIF p_game='boxdrop' THEN
  CASE p_operation
  WHEN 'deal' THEN RETURN private.boxdrop_board_deal(jsonb_build_object('rules',p_config,'score',p_score),p_at);
  WHEN 'reduce' THEN RETURN private.boxdrop_board_reduce(p_board,p_action,p_items,p_at);
  WHEN 'visible' THEN RETURN private.boxdrop_visible(p_board);
  WHEN 'rounds' THEN RETURN to_jsonb(private.boxdrop_required_rounds(p_score));
  ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';END CASE;
 ELSE RAISE EXCEPTION 'delayed:invalid_game';END IF;
END $$;
REVOKE ALL ON FUNCTION public.delayed_board_core(text,text,jsonb,bigint,jsonb,text,integer[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_board_core(text,text,jsonb,bigint,jsonb,text,integer[],bigint) TO service_role;


-- Keep the existing minute job, incident gate and health record. One dispatcher.
CREATE TABLE private.delayed_recovery_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 token uuid,claimed boolean NOT NULL DEFAULT false,expires_at timestamptz,last_success timestamptz,failure text
);
INSERT INTO private.delayed_recovery_state DEFAULT VALUES;
ALTER TABLE private.delayed_recovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_recovery_state FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION private.delayed_words_recover() RENAME TO delayed_words_recover_local;
DO $$ DECLARE source_i text;old_i text;BEGIN
 source_i:=pg_get_functiondef('private.delayed_words_recover_local()'::regprocedure);
 old_i:='IF private.delayed_expire(c.id,c.segment,c.expires_at) THEN';
 IF position(old_i IN source_i)=0 THEN RAISE EXCEPTION 'delayed:recovery_source_changed';END IF;
 EXECUTE replace(source_i,old_i,'IF c.game_type=''ptown-words'' AND private.delayed_expire(c.id,c.segment,c.expires_at) THEN');
END $$;

CREATE FUNCTION private.delayed_words_recover() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
   AND least(c.expires_at,c.gameplay_due_at)<=clock_timestamp()) THEN RETURN n;END IF;
 UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;
 UPDATE private.delayed_recovery_state SET token=t,claimed=false,expires_at=clock_timestamp()+interval '25 seconds',
  failure=CASE WHEN s.token IS NOT NULL THEN 'delayed:lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/delayed-recovery',
  headers:=jsonb_build_object('Content-Type','application/json','x-delayed-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.delayed_words_recover(),private.delayed_words_recover_local() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_recovery_claim(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.delayed_recovery_state;records jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM 1 FROM private.delayed_words_health WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT s FROM private.delayed_recovery_state WHERE singleton FOR UPDATE;
 IF p_token IS NULL OR s.token IS DISTINCT FROM p_token OR s.claimed OR s.expires_at<=clock_timestamp() OR NOT s.enabled
 THEN RAISE EXCEPTION 'delayed:recovery_denied';END IF;
 UPDATE private.delayed_recovery_state SET claimed=true WHERE singleton;
 SELECT coalesce(jsonb_agg(private.delayed_child_record(c::private.delayed_children)),'[]') INTO records FROM (
  SELECT c.* FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
  WHERE NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id) AND c.game_type<>'ptown-words'
   AND least(c.expires_at,c.gameplay_due_at)<=clock_timestamp()
  ORDER BY least(c.expires_at,c.gameplay_due_at),c.id LIMIT 20) c;
 RETURN records;
END $$;
CREATE FUNCTION public.delayed_recovery_complete(p_token uuid,p_failure text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM 1 FROM private.delayed_words_health WHERE singleton FOR UPDATE;
 UPDATE private.delayed_recovery_state SET token=NULL,claimed=false,expires_at=NULL,failure=p_failure,
  last_success=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_success END
 WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'delayed:recovery_denied';END IF;
 IF p_failure IS NULL THEN UPDATE private.delayed_words_health SET last_tick=clock_timestamp() WHERE singleton;END IF;
END $$;
REVOKE ALL ON FUNCTION public.delayed_recovery_claim(uuid),public.delayed_recovery_complete(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_recovery_claim(uuid),public.delayed_recovery_complete(uuid,text) TO service_role;


-- Five-game fake-only admission candidate; activation remains gated.
CREATE FUNCTION private.delayed_multi_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT coalesce((SELECT enabled FROM private.delayed_recovery_state WHERE singleton),false) $$;
REVOKE ALL ON FUNCTION private.delayed_multi_enabled() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.delayed_capabilities() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',true,'max_children',CASE WHEN private.delayed_multi_enabled() THEN 32 ELSE 1 END,'games',CASE WHEN NOT private.delayed_multi_enabled() THEN jsonb_build_array(jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3'))) ELSE jsonb_build_array(
 jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3')),
 jsonb_build_object('id','run21','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='run21'),'rules',(SELECT config FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21')),
 jsonb_build_object('id','tri-towers','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='tri-towers'),'rules',private.tri_towers_rules()),
 jsonb_build_object('id','quintzee','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='quintzee'),'rules',private.quintzee_default_rules()),
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules())) END) WHERE auth.uid() IS NOT NULL
$$;
ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check;
ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop'));
CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid,p_opponent uuid,p_real_money boolean,p_lineup jsonb)
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
END $$;

CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid,p_request uuid,p_offer_hash text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
END $$;



-- Only paired round scores are shared before completion. Never expose a board/deck.
CREATE FUNCTION private.delayed_child_scores(c private.delayed_children) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN c.game_type='ptown-words' THEN c.state->'scores'
 ELSE (WITH participants AS(SELECT value AS actor FROM jsonb_array_elements_text(c.state->'players')),
 paired AS(SELECT min((SELECT count(*) FROM jsonb_array_elements(c.state->'attempts') a WHERE a->>'actor'=p.actor)) n FROM participants p)
 SELECT jsonb_object_agg(p.actor,coalesce((SELECT sum((a->>'score')::bigint) FROM jsonb_array_elements(c.state->'attempts') a
  WHERE a->>'actor'=p.actor AND (c.terminal OR (a->>'round')::integer<=(SELECT n FROM paired))),0)) FROM participants p) END
$$;
REVOKE ALL ON FUNCTION private.delayed_child_scores(private.delayed_children) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE source_i text;BEGIN
 source_i:=pg_get_functiondef('public.delayed_home(uuid)'::regprocedure);
 IF position('''scores'',c.state->''scores''' IN source_i)=0 THEN RAISE EXCEPTION 'delayed:home_source_changed';END IF;
 EXECUTE replace(source_i,'''scores'',c.state->''scores''','''scores'',private.delayed_child_scores(c)');
END $$;


-- The existing incident owner also shifts active Quintzee presentation holds.
DO $$ DECLARE source_i text;old_i text;new_i text;BEGIN
 source_i:=pg_get_functiondef('private.delayed_incident_close(uuid,text)'::regprocedure);
 old_i:='IF s->>''segmentStartedAt'' IS NOT NULL THEN';
 IF position(old_i IN source_i)=0 THEN RAISE EXCEPTION 'delayed:incident_source_changed';END IF;
 new_i:='IF c.game_type=''quintzee'' AND (s#>>''{board,celebration,endsAt}'')::bigint>floor(extract(epoch FROM incident.opened_at)*1000) THEN
 s:=jsonb_set(s,''{board,celebration}'',(s#>''{board,celebration}'')||jsonb_build_object(
 ''startedAt'',(s#>>''{board,celebration,startedAt}'')::bigint+ms,
 ''countAt'',(s#>>''{board,celebration,countAt}'')::bigint+ms,
 ''endsAt'',(s#>>''{board,celebration,endsAt}'')::bigint+ms));END IF; ';
 EXECUTE replace(source_i,old_i,new_i||old_i);
END $$;
