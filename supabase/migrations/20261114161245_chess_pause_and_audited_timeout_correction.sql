-- Canonical host pause; request-only control follows Words without changing rules.
CREATE OR REPLACE FUNCTION private.chess_record(mode_i text, id_i uuid, actor_i uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.chess_matches;c private.delayed_children;parent private.delayed_matches;answer jsonb;
BEGIN
 IF mode_i='live' THEN
  SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=id_i;
  answer:=jsonb_build_object('state',m.state,'revision',m.revision,'paused',m.paused_at IS NOT NULL,'pausedAt',m.paused_at,'finished',m.finished,'settled',m.settlement IS NOT NULL,'settlement',m.settlement,'viewerId',(SELECT p.id FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor_i AND NOT p.is_bot),'financial',jsonb_build_object('balances',CASE WHEN m.settlement IS NULL THEN (SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=m.game_id) ELSE (SELECT jsonb_object_agg(player_id,chips) FROM public.session_player_snapshots WHERE dealer_game_id=id_i AND hand_number=1) END,'resultId',(SELECT id FROM public.game_results WHERE dealer_game_id=id_i AND settlement_key='chess_terminal'),'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE dealer_game_id=id_i ORDER BY cursor DESC LIMIT 1)));
 ELSE
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=id_i AND game_type='chess';
  SELECT * INTO STRICT parent FROM private.delayed_matches WHERE id=c.match_id;
  answer:=jsonb_build_object('state',c.state,'revision',c.revision,'paused',private.delayed_held(parent.id),'pausedAt',(SELECT floor(extract(epoch FROM min(opened_at))*1000) FROM private.delayed_incidents WHERE closed_at IS NULL AND (match_id IS NULL OR match_id=parent.id)),'finished',c.terminal,'settled',c.terminal,'settlement',NULL,'viewerId',actor_i,'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',NULL,'batch',NULL));
 END IF;
 IF mode_i='live' THEN answer:=answer||(SELECT jsonb_build_object('hostUserId',current_host,'pauseVersion',pause_version) FROM public.games WHERE id=m.game_id); END IF;
 RETURN answer||jsonb_build_object('serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$;

CREATE OR REPLACE FUNCTION private.chess_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE delta bigint;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);m private.chess_matches;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'chess' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.chess_matches WHERE dealer_game_id=NEW.current_game_uuid FOR UPDATE;
 IF NOT FOUND OR m.finished THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.chess_matches SET state=state-'pauseRequest',paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN delta:=at_ms-m.paused_at;UPDATE private.chess_matches SET state=jsonb_set(state,'{deadline}',to_jsonb((state->>'deadline')::bigint+delta))||CASE WHEN state?'terminal' THEN jsonb_build_object('terminal',(state->'terminal')||jsonb_build_object('deadline',(state#>>'{terminal,deadline}')::bigint+delta)) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;END IF;RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.chess_host_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.chess_matches SET state=state-'pauseRequest',revision=revision+1
 WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished;
 RETURN NEW;
END $$;
CREATE TRIGGER chess_host_changed AFTER UPDATE OF current_host ON public.games
FOR EACH ROW WHEN(NEW.game_type='chess' AND NEW.current_host IS DISTINCT FROM OLD.current_host)
EXECUTE FUNCTION private.chess_host_changed();
REVOKE ALL ON FUNCTION private.chess_host_changed() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.chess_request_pause(p_id uuid,p_actor uuid,p_request uuid,p_revision bigint,p_intent jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.chess_matches;g public.games;prior private.chess_requests;v jsonb;fingerprint jsonb:=jsonb_build_object('revision',p_revision,'intent',p_intent);
BEGIN
 PERFORM private.chess_authorize('live',p_id,p_actor);
 PERFORM private.chess_sync('live',p_id);
 SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=p_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 SELECT * INTO prior FROM private.chess_requests WHERE mode='live' AND match_id=p_id AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM p_actor OR prior.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'chess:request_conflict';END IF;
  RETURN private.chess_record('live',p_id,p_actor);
 END IF;
 IF p_request IS NULL OR p_revision IS DISTINCT FROM m.revision THEN RAISE EXCEPTION 'chess:stale_action';END IF;
 v:=private.chess_record('live',p_id,p_actor);
 IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.state->>'phase'<>'playing' OR p_actor=g.current_host
 THEN RAISE EXCEPTION 'chess:pause_request_unavailable';END IF;
 IF p_intent=jsonb_build_object('type','request_pause') THEN
  IF NOT (m.state ? 'pauseRequest') THEN
   UPDATE private.chess_matches SET state=state||jsonb_build_object('pauseRequest',jsonb_build_object('id',p_request,'playerId',v->>'viewerId','hostUserId',g.current_host,'pauseVersion',g.pause_version)),revision=revision+1 WHERE dealer_game_id=p_id;
  END IF;
 ELSIF p_intent->>'type'='cancel_pause_request' AND p_intent=jsonb_build_object('type','cancel_pause_request','requestId',m.state#>>'{pauseRequest,id}')
  AND m.state#>>'{pauseRequest,playerId}'=v->>'viewerId' THEN
  UPDATE private.chess_matches SET state=state-'pauseRequest',revision=revision+1 WHERE dealer_game_id=p_id;
 ELSE RAISE EXCEPTION 'chess:pause_request_unavailable';END IF;
 INSERT INTO private.chess_requests(mode,match_id,request_id,actor,fingerprint) VALUES('live',p_id,p_request,p_actor,fingerprint);
 RETURN private.chess_record('live',p_id,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.chess_request_pause(uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chess_request_pause(uuid,uuid,uuid,bigint,jsonb) TO service_role;

-- One audited correction per settled, single-child Chess match. Original ledgers
-- remain immutable; current projections select the correction generation.
CREATE TABLE private.delayed_corrections(
 id uuid PRIMARY KEY,child_id uuid NOT NULL UNIQUE REFERENCES private.delayed_children(id),
 match_id uuid NOT NULL UNIQUE REFERENCES private.delayed_matches(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),reason text NOT NULL,
 fingerprint jsonb NOT NULL,before_child jsonb NOT NULL,restored_child jsonb NOT NULL,
 before_parent jsonb NOT NULL,original_outcome jsonb NOT NULL,original_settlement jsonb NOT NULL,
 reversal_ids uuid[] NOT NULL,financial_game_id uuid NOT NULL UNIQUE,
 transaction_id bigint NOT NULL,executor_role text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.delayed_reopened_outcomes(LIKE private.delayed_outcomes INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE private.delayed_reopened_outcomes ADD PRIMARY KEY(child_id),ADD FOREIGN KEY(child_id,match_id) REFERENCES private.delayed_children(id,match_id);
CREATE TABLE private.delayed_reopened_settlements(LIKE private.delayed_settlements INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE private.delayed_reopened_settlements ADD PRIMARY KEY(match_id),ADD UNIQUE(game_id),ADD UNIQUE(dealer_game_id),ADD UNIQUE(result_id),
 ADD FOREIGN KEY(match_id) REFERENCES private.delayed_matches(id),ADD FOREIGN KEY(game_id) REFERENCES public.games(id),
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id),ADD FOREIGN KEY(result_id) REFERENCES public.game_results(id);
CREATE TABLE private.delayed_reopened_finale_seen(LIKE private.delayed_finale_seen INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE private.delayed_reopened_finale_seen ADD PRIMARY KEY(match_id,viewer),ADD FOREIGN KEY(match_id) REFERENCES private.delayed_corrections(match_id),ADD FOREIGN KEY(viewer) REFERENCES public.profiles(id);

CREATE TABLE private.delayed_reopened_runback_viewers(LIKE private.delayed_runback_viewers INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE private.delayed_reopened_runback_viewers ADD PRIMARY KEY(match_id),ADD FOREIGN KEY(match_id) REFERENCES private.delayed_corrections(match_id),ADD FOREIGN KEY(viewer) REFERENCES public.profiles(id);
ALTER TABLE private.delayed_reopened_runback_viewers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER delayed_reopened_runback_immutable BEFORE UPDATE OR DELETE ON private.delayed_reopened_runback_viewers FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE VIEW private.delayed_current_runback_viewers AS
 SELECT r.* FROM private.delayed_runback_viewers r WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.match_id=r.match_id)
 UNION ALL SELECT * FROM private.delayed_reopened_runback_viewers;
REVOKE ALL ON private.delayed_reopened_runback_viewers,private.delayed_current_runback_viewers FROM PUBLIC,anon,authenticated,service_role;
CREATE VIEW private.delayed_current_outcomes AS
 SELECT o.* FROM private.delayed_outcomes o WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.child_id=o.child_id)
 UNION ALL SELECT * FROM private.delayed_reopened_outcomes;
CREATE VIEW private.delayed_current_settlements AS
 SELECT s.* FROM private.delayed_settlements s WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.match_id=s.match_id)
 UNION ALL SELECT * FROM private.delayed_reopened_settlements;
CREATE VIEW private.delayed_current_review_events AS
 SELECT e.* FROM private.delayed_review_events e WHERE e.kind<>'child' OR NOT EXISTS(
 SELECT FROM private.delayed_corrections x WHERE x.child_id=e.child_id AND e.completed_at<x.created_at);
CREATE VIEW private.delayed_current_finale_seen AS
 SELECT s.* FROM private.delayed_finale_seen s WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.match_id=s.match_id)
 UNION ALL SELECT * FROM private.delayed_reopened_finale_seen;
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['delayed_corrections','delayed_reopened_outcomes','delayed_reopened_settlements','delayed_reopened_finale_seen'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable()',t||'_immutable',t);
 END LOOP;
END $$;
REVOKE ALL ON private.delayed_current_outcomes,private.delayed_current_settlements,private.delayed_current_review_events,private.delayed_current_finale_seen FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.delayed_child_record(c private.delayed_children)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT to_jsonb(c)||jsonb_build_object('organizer',m.organizer,'opponent',m.opponent,
  'status',m.status,'held',private.delayed_held(m.id),'server_at',floor(extract(epoch FROM clock_timestamp())*1000),
  'outcome',(SELECT jsonb_build_object('winner',o.winner,'reason',o.reason,'organizer_delta',o.organizer_delta,'opponent_delta',o.opponent_delta)
   FROM private.delayed_current_outcomes o WHERE o.child_id=c.id))
 FROM private.delayed_matches m WHERE m.id=c.match_id
$function$;

CREATE OR REPLACE FUNCTION private.delayed_finalize(parent uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE financial_id uuid; m private.delayed_matches; receipt private.delayed_settlements; n integer; completed integer;
 net_i bigint; hash text; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); dg uuid:=gen_random_uuid(); result_id uuid:=gen_random_uuid(); changes jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 SELECT coalesce((SELECT financial_game_id FROM private.delayed_corrections WHERE match_id=parent),parent) INTO financial_id;
 SELECT * INTO receipt FROM private.delayed_current_settlements WHERE match_id=parent;
 IF FOUND THEN RETURN to_jsonb(receipt); END IF;
 IF m.status<>'active' OR private.delayed_held(parent) THEN RAISE EXCEPTION 'delayed:not_settleable'; END IF;
 SELECT count(*) INTO n FROM private.delayed_children WHERE match_id=parent;
 SELECT count(*),coalesce(sum(o.organizer_delta),0),md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY c.ordinal)::text,''))
  INTO completed,net_i,hash FROM private.delayed_children c JOIN private.delayed_current_outcomes o ON o.child_id=c.id AND o.match_id=c.match_id
  WHERE c.match_id=parent AND c.terminal;
 IF n=0 OR n<>jsonb_array_length(m.offer) OR completed<>n THEN RETURN NULL; END IF;
 IF abs(net_i)>2147483647 THEN RAISE EXCEPTION 'delayed:amount_overflow'; END IF;
 INSERT INTO public.games(id,name,game_type,status,current_host,real_money,pot,buy_in)
  VALUES(financial_id,'Delayed Head-to-Head','delayed-head-to-head','game_over',m.organizer,m.real_money,0,0);
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config)
  VALUES(dg,financial_id,m.organizer,'delayed-head-to-head',jsonb_build_object('offerHash',m.offer_hash,'policy',m.policy_version));
 UPDATE public.games SET current_game_uuid=dg WHERE id=financial_id;
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot,sitting_out,waiting)
  VALUES(a,financial_id,m.organizer,1,0,'active',false,false,false),(b,financial_id,m.opponent,2,0,'active',false,false,false);
 changes:=jsonb_build_object(a::text,net_i,b::text,-net_i);
 INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,
  winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(result_id,financial_id,dg,1,'delayed_parent','delayed-head-to-head',CASE WHEN net_i>0 THEN a WHEN net_i<0 THEN b END,
  CASE WHEN net_i=0 THEN 'Tie' ELSE (SELECT username FROM public.profiles WHERE id=CASE WHEN net_i>0 THEN m.organizer ELSE m.opponent END) END,
  'Delayed match aggregate',abs(net_i)::integer,changes,net_i=0);
 IF net_i<>0 THEN
  PERFORM public.settle_gameplay_chip_transfers(financial_id,jsonb_build_array(jsonb_build_object(
   'from',jsonb_build_object('kind','player','playerId',CASE WHEN net_i>0 THEN b ELSE a END),
   'to',jsonb_build_object('kind','player','playerId',CASE WHEN net_i>0 THEN a ELSE b END),'amount',abs(net_i)::integer)),'win');
 END IF;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
 SELECT financial_id,dg,1,p.id,p.user_id,pr.username,p.chips,false FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=financial_id;
 -- record_session_results owns account posting from these final snapshots.
 UPDATE public.games SET status='session_ended',session_ended_at=clock_timestamp(),game_over_at=clock_timestamp(),pending_session_end=false WHERE id=financial_id;
 IF m.real_money AND ((SELECT count(*) FROM public.player_transactions WHERE source_game_id=financial_id AND transaction_type='SessionResult')<>2
  OR NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=financial_id AND profile_id=m.organizer AND transaction_type='SessionResult' AND player_transactions.amount=net_i)
  OR NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=financial_id AND profile_id=m.opponent AND transaction_type='SessionResult' AND player_transactions.amount=-net_i))
 THEN RAISE EXCEPTION 'delayed:account_posting_mismatch'; END IF;
 IF financial_id<>parent THEN
 INSERT INTO private.delayed_reopened_settlements(match_id,game_id,dealer_game_id,result_id,outcome_hash,child_count,organizer_delta,opponent_delta)
 VALUES(parent,financial_id,dg,result_id,hash,n,net_i,-net_i) RETURNING * INTO receipt;
 ELSE
 INSERT INTO private.delayed_settlements(match_id,game_id,dealer_game_id,result_id,outcome_hash,child_count,organizer_delta,opponent_delta)
 VALUES(parent,financial_id,dg,result_id,hash,n,net_i,-net_i) RETURNING * INTO receipt;
 END IF;
 UPDATE private.delayed_matches SET status='settled',settled_at=clock_timestamp(),revision=revision+1 WHERE id=parent;
 PERFORM private.delayed_notify(parent);
 RETURN to_jsonb(receipt);
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_reviews_complete(parent uuid, who uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT FROM private.delayed_matches m
  JOIN private.delayed_current_settlements s ON s.match_id=m.id
  WHERE m.id=parent AND who IN(m.organizer,m.opponent) AND m.status='settled')
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent)
 AND NOT EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent AND
  (NOT c.terminal OR NOT EXISTS(SELECT FROM private.delayed_current_review_events e
    WHERE e.child_id=c.id AND e.kind='child')))
 AND NOT EXISTS(SELECT FROM private.delayed_current_review_events e WHERE e.match_id=parent
  AND (e.kind='child' OR e.actor IS DISTINCT FROM who)
  AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who))
$function$;

CREATE OR REPLACE FUNCTION private.delayed_record_outcome(child uuid, expected_revision bigint, reason_i text, winner_i uuid, evidence_i jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children; m private.delayed_matches; old private.delayed_outcomes; delta_i integer;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 SELECT * INTO old FROM private.delayed_current_outcomes WHERE child_id=child;
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
 IF EXISTS(SELECT FROM private.delayed_corrections WHERE child_id=child) THEN
 INSERT INTO private.delayed_reopened_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i) RETURNING * INTO old;
 ELSE
 INSERT INTO private.delayed_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i) RETURNING * INTO old;
 END IF;
 UPDATE private.delayed_children SET terminal=true,revision=revision+1 WHERE id=c.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_finalize(m.id);
 PERFORM private.delayed_notify(m.id);
 RETURN to_jsonb(old);
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_home_before_reviews(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches;who uuid:=auth.uid();lineup jsonb;net bigint;finished integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent);
 IF NOT FOUND THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'ordinal',c.ordinal,'game',c.game_type,'stake',c.stake,'config',c.config,
  'starter',c.starter,'actor',c.actor,'segment',c.segment,'revision',c.revision,'terminal',c.terminal,
  'availableAt',c.available_at,'lastCallAt',c.last_call_at,'expiresAt',c.expires_at,'startedAt',c.started_at,'scores',private.delayed_child_scores(c),'lastMove',c.state->'moves'->-1,
  'result',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'at',o.completed_at,
   'delta',CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END) ORDER BY c.ordinal),
  coalesce(sum(CASE WHEN who=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END),0),count(o.child_id)
 INTO lineup,net,finished FROM private.delayed_children c LEFT JOIN private.delayed_current_outcomes o ON o.child_id=c.id WHERE c.match_id=m.id;
 RETURN jsonb_build_object('id',m.id,'status',m.status,'revision',m.revision,'realMoney',m.real_money,'offerHash',m.offer_hash,
  'organizer',m.organizer,'opponent',m.opponent,'players',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',username)) FROM public.profiles WHERE id IN(m.organizer,m.opponent)),
  'createdAt',m.created_at,'invitationExpiresAt',m.expires_at,'acceptedAt',m.accepted_at,'settledAt',m.settled_at,
  'correction',(SELECT jsonb_build_object('id',id,'reason',reason,'at',created_at,'originalResult',original_outcome,'reversed',true) FROM private.delayed_corrections WHERE match_id=m.id),'held',private.delayed_held(m.id),'lineup',lineup,'net',net,'completed',finished,
  'exposure',(SELECT sum(stake) FROM private.delayed_children WHERE match_id=m.id),
  'receipt',(SELECT to_jsonb(s) FROM private.delayed_current_settlements s WHERE match_id=m.id),
  'removedAt',(SELECT removed_at FROM private.delayed_removals WHERE match_id=m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_capture_reviews()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE a jsonb; e uuid; o private.delayed_outcomes; move jsonb;
BEGIN
 IF NEW.game_type<>'ptown-words' THEN
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(NEW.state->'attempts','[]')) LOOP
   e:=NULL;
   INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
   VALUES(NEW.id,NEW.match_id,NEW.id||':'||(a->>'actor')||':'||(a->>'round'),'attempt',(a->>'actor')::uuid,
    (a->>'round')::int,(a->>'score')::bigint,to_timestamp((a->>'at')::numeric/1000),
    jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'result',a#>'{board,result}'))
   ON CONFLICT(event_key) DO NOTHING RETURNING id INTO e;
   IF e IS NOT NULL THEN INSERT INTO private.delayed_review_boards VALUES(e,private.delayed_review_board(NEW.game_type,a->'board'));END IF;
  END LOOP;
 ELSIF OLD.state->>'turn' IS DISTINCT FROM NEW.state->>'turn' THEN
  move:=NEW.state->'moves'->-1;
  IF move IS NOT NULL THEN
   INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
   VALUES(NEW.id,NEW.match_id,NEW.id||':word:'||(move->>'turn'),'attempt',(move->>'playerId')::uuid,
    (move->>'turn')::int,(move->>'points')::bigint,clock_timestamp(),jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'move',move))
   ON CONFLICT(event_key) DO NOTHING RETURNING id INTO e;
   IF e IS NOT NULL THEN INSERT INTO private.delayed_review_boards VALUES(e,private.delayed_review_board(NEW.game_type,NEW.state));END IF;
  END IF;
 END IF;
 IF NEW.terminal AND NOT OLD.terminal THEN
  SELECT * INTO STRICT o FROM private.delayed_current_outcomes WHERE child_id=NEW.id;
  INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
  VALUES(NEW.id,NEW.match_id,NEW.id||':final'||coalesce((SELECT ':'||id::text FROM private.delayed_corrections WHERE child_id=NEW.id),''),'child',NULL,0,NULL,o.completed_at,
   jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'reason',o.reason,'winner',o.winner,
    'organizerDelta',o.organizer_delta,'opponentDelta',o.opponent_delta,'stake',NEW.stake))
  ON CONFLICT(event_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_history(p_profile uuid DEFAULT NULL::uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'opponent',(SELECT username FROM public.profiles WHERE id=CASE WHEN auth.uid()=m.organizer THEN m.opponent ELSE m.organizer END),
 'startedAt',m.accepted_at,'completedAt',m.settled_at,'count',s.child_count,'net',CASE WHEN auth.uid()=m.organizer THEN s.organizer_delta ELSE s.opponent_delta END,'realMoney',m.real_money) ORDER BY m.settled_at DESC,m.id DESC),'[]')
 FROM (SELECT candidate.* FROM private.delayed_matches candidate WHERE auth.uid() IN(candidate.organizer,candidate.opponent) AND candidate.status='settled' AND (p_profile IS NULL OR p_profile=auth.uid()) AND (p_before IS NULL OR (candidate.settled_at,candidate.id)<(p_before,p_before_id)) ORDER BY candidate.settled_at DESC,candidate.id DESC LIMIT 30) m JOIN private.delayed_current_settlements s ON s.match_id=m.id
$function$;

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
 SELECT * INTO o FROM private.delayed_current_outcomes WHERE child_id=c.id;
 SELECT * INTO receipt FROM private.delayed_current_settlements WHERE match_id=m.id;
 held:=private.delayed_held(m.id);
 s:=private.ptown_words_visible(c.state,viewer::text);
 IF c.config->>'version'='ptown-words/2' THEN
  s:=s||jsonb_build_object('playDeadline',floor(extract(epoch FROM c.gameplay_due_at)*1000),'availabilityDeadline',floor(extract(epoch FROM c.expires_at)*1000));
  IF c.gameplay_due_at IS NOT NULL AND viewer=c.actor THEN s:=s-'movePresentation';END IF;
 END IF;
 RETURN s||jsonb_build_object('identity',jsonb_build_object('sessionId',m.id,'dealerGameId',c.id,'roundId',c.id),
 'revision',c.revision,'viewerId',viewer,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),
 'deadline',floor(extract(epoch FROM coalesce(c.gameplay_due_at,c.expires_at))*1000),'lastCallAt',floor(extract(epoch FROM c.last_call_at)*1000),
 'canAct',NOT c.terminal AND NOT held AND c.actor=viewer,'paused',held,'pausedAt',NULL,'finished',c.terminal,
 'phase',CASE WHEN c.terminal THEN 'complete' ELSE 'playing' END,'settlement',CASE WHEN receipt.match_id IS NOT NULL THEN jsonb_build_object(m.organizer::text,receipt.organizer_delta,m.opponent::text,receipt.opponent_delta) END,
 'outcome',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'delta',CASE WHEN viewer=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END,
 'terminal',CASE WHEN c.terminal THEN jsonb_build_object('resultId',receipt.result_id,'winnerIds',CASE WHEN o.winner IS NULL THEN jsonb_build_array(m.organizer,m.opponent) ELSE jsonb_build_array(o.winner) END,'score',(SELECT max(value::int) FROM jsonb_each_text(c.state->'scores')),'startedAt',floor(extract(epoch FROM o.completed_at)*1000),'deadline',floor(extract(epoch FROM o.completed_at)*1000)) END,
 'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',receipt.result_id,'batch',NULL));
END $function$;

CREATE OR REPLACE FUNCTION public.chess_history(p_mode text, p_match uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE who uuid:=auth.uid(); answer jsonb;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'chess:authentication_required' USING ERRCODE='42501';END IF;
 IF p_mode NOT IN ('live','async') OR p_mode IS NULL OR (p_match IS NULL AND p_id IS NULL) THEN RAISE EXCEPTION 'chess:invalid_history_request';END IF;
 WITH saved AS (
  SELECT m.dealer_game_id id,m.game_id session_id,m.state,
   (m.state#>>'{terminal,startedAt}')::bigint completed_at
  FROM private.chess_matches m
  WHERE p_mode='live' AND m.settlement IS NOT NULL AND m.state->>'phase'='complete'
   AND (p_match IS NULL OR m.game_id=p_match) AND (p_id IS NULL OR m.dealer_game_id=p_id)
  UNION ALL
  SELECT c.id,c.match_id,c.state,floor(extract(epoch FROM o.completed_at)*1000)::bigint
  FROM private.delayed_children c JOIN private.delayed_current_outcomes o ON o.child_id=c.id
  WHERE p_mode='async' AND c.game_type='chess' AND c.terminal AND c.state->>'phase'='complete'
   AND (p_match IS NULL OR c.match_id=p_match) AND (p_id IS NULL OR c.id=p_id)
 ), allowed AS (
  SELECT s.*,p->>'id' viewer_id FROM saved s
  CROSS JOIN LATERAL jsonb_array_elements(s.state->'players') p
  WHERE p->>'userId'=who::text AND coalesce((p->>'isBot')::boolean,false)=false
  ORDER BY s.completed_at DESC,s.id DESC LIMIT 50
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'completedAt',completed_at,
  'state',state||jsonb_build_object('viewerId',viewer_id)) ORDER BY completed_at DESC,id DESC),'[]'::jsonb) INTO answer FROM allowed;
 RETURN answer;
END $function$;

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
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_current_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind='attempt'),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_review_cleanup_eligible(e private.delayed_review_events)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT e.kind='attempt' AND e.receipt->>'game'<>'ptown-words'
 AND NOT EXISTS(SELECT FROM private.delayed_review_playback p WHERE p.event_id=e.id AND p.lease_until>clock_timestamp())
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND
  EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=CASE WHEN e.actor=m.organizer THEN m.opponent ELSE m.organizer END))
 AND (
  (EXISTS(SELECT FROM private.delayed_current_review_events later WHERE later.child_id=e.child_id AND later.kind='attempt' AND later.actor<>e.actor AND later.round>=e.round)
   OR EXISTS(SELECT FROM private.delayed_children c WHERE c.id=e.child_id AND c.terminal))
  AND NOT EXISTS(SELECT FROM private.delayed_current_review_events f JOIN private.delayed_matches m ON m.id=f.match_id WHERE f.child_id=e.child_id AND f.kind='child'
   AND (NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=f.id AND s.viewer=m.organizer)
     OR NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=f.id AND s.viewer=m.opponent)))
 )
$function$;

CREATE OR REPLACE FUNCTION private.delayed_prune_review_boards()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE removed integer:=0;counted integer;e private.delayed_review_events;
BEGIN
 FOR e IN SELECT candidate.* FROM private.delayed_current_review_events candidate JOIN private.delayed_review_boards saved ON saved.event_id=candidate.id
  WHERE private.delayed_review_cleanup_eligible(candidate) ORDER BY candidate.match_id,candidate.completed_at LIMIT 100 LOOP
  -- The same parent lock serializes playback leases, acknowledgements and pruning.
  PERFORM 1 FROM private.delayed_matches WHERE id=e.match_id FOR UPDATE;
  IF private.delayed_review_cleanup_eligible(e) THEN
   DELETE FROM private.delayed_review_boards WHERE event_id=e.id;
   GET DIAGNOSTICS counted=ROW_COUNT;removed:=removed+counted;
  END IF;
 END LOOP;
 RETURN removed;
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_notify(parent uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches;who uuid;n int;available int;k text;active boolean;p jsonb;seen boolean;
BEGIN
 PERFORM private.delayed_notify_before_reviews(parent);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=parent) THEN RETURN;END IF;
 IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=parent AND actor=m.organizer AND NOT terminal) THEN
  INSERT INTO private.delayed_acceptance_retired VALUES(parent) ON CONFLICT DO NOTHING;
 END IF;
 FOREACH who IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT count(*) INTO available FROM private.delayed_children WHERE match_id=parent AND actor=who AND NOT terminal;
  SELECT count(*) INTO n FROM private.delayed_current_review_events e WHERE e.match_id=parent AND kind='child' AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who);
  FOREACH k IN ARRAY ARRAY['accepted','results','settled'] LOOP
   active:=CASE k WHEN 'accepted' THEN who=m.organizer AND m.status='active' AND available=0 AND NOT EXISTS(SELECT FROM private.delayed_acceptance_retired WHERE match_id=parent)
    WHEN 'results' THEN m.status='active' AND n>0
    ELSE m.status='settled' AND NOT EXISTS(SELECT FROM private.delayed_current_finale_seen WHERE match_id=parent AND viewer=who) END;
   p:=jsonb_build_object('status',m.status,'opponentId',CASE WHEN who=m.organizer THEN m.opponent ELSE m.organizer END,
    'opponentName',(SELECT username FROM public.profiles WHERE id=CASE WHEN who=m.organizer THEN m.opponent ELSE m.organizer END),'completionCount',n,'availableCount',available);
   INSERT INTO public.platform_notifications(user_id,match_id,kind,actionable,payload) VALUES(who,parent,k,active,p)
   ON CONFLICT(user_id,match_id,kind) DO UPDATE SET actionable=EXCLUDED.actionable,payload=EXCLUDED.payload,revision=platform_notifications.revision+1,updated_at=clock_timestamp()
    WHERE (platform_notifications.actionable,platform_notifications.payload) IS DISTINCT FROM (EXCLUDED.actionable,EXCLUDED.payload);
  END LOOP;
 END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_reviews(p_child uuid)
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
 FROM private.delayed_current_review_events e LEFT JOIN private.delayed_review_boards b ON b.event_id=e.id WHERE e.child_id=c.id AND (e.actor IS DISTINCT FROM who OR e.kind='child') AND private.delayed_take_two_review_allowed(e,who);
 RETURN jsonb_build_object('events',answer,'terminal',c.terminal,'actor',c.actor,'segment',c.segment,'revision',c.revision,'started',c.started_at IS NOT NULL,'expiresAt',c.expires_at,'held',private.delayed_held(m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_history_detail(p_match uuid)
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
  'runbackEligible',EXISTS(SELECT FROM private.delayed_current_runback_viewers WHERE match_id=p_match AND viewer=auth.uid()),
  'opponentEligible',private.delayed_human((CASE WHEN h->>'organizer'=auth.uid()::text THEN h->>'opponent' ELSE h->>'organizer' END)::uuid),
  'policyVersion',(SELECT policy_version FROM private.delayed_matches WHERE id=p_match))||jsonb_build_object('lineup',(SELECT jsonb_agg(item||jsonb_build_object('result',saved->'result') ORDER BY (item->>'ordinal')::int) FROM jsonb_array_elements(h->'lineup') item JOIN jsonb_array_elements(original->'lineup') saved ON item->>'id'=saved->>'id'),'unsettled',0,'finaleViewed',EXISTS(SELECT FROM private.delayed_current_finale_seen WHERE match_id=p_match AND viewer=auth.uid()));
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_review_begin(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;who uuid:=auth.uid();started timestamptz;
BEGIN
 SELECT * INTO e FROM private.delayed_current_review_events WHERE id=p_event;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent)) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id)
 THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE id=e.match_id FOR UPDATE;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 IF NOT private.delayed_take_two_review_allowed(e,who) THEN RAISE EXCEPTION 'delayed:review_unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_playback(event_id,viewer) VALUES(e.id,who)
 ON CONFLICT(event_id,viewer) DO UPDATE SET lease_until=clock_timestamp()+interval '5 minutes'
 RETURNING started_at INTO started;
 RETURN jsonb_build_object('elapsed',greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000)),'seen',EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=e.id AND viewer=who));
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_finale_ack(p_match uuid)
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
 IF EXISTS(SELECT FROM private.delayed_corrections WHERE match_id=m.id) THEN
 INSERT INTO private.delayed_reopened_finale_seen VALUES(m.id,who,clock_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 ELSE
 INSERT INTO private.delayed_finale_seen VALUES(m.id,who,clock_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 END IF;
 IF inserted=0 THEN RETURN;END IF;
 -- The existing parent lock serializes both viewers; only the second fresh ACK wins.
 IF EXISTS(SELECT FROM private.delayed_current_finale_seen s WHERE s.match_id=m.id AND s.viewer<>who)
    AND private.delayed_reviews_complete(m.id,m.organizer)
    AND private.delayed_reviews_complete(m.id,m.opponent) THEN
  IF EXISTS(SELECT FROM private.delayed_corrections WHERE match_id=m.id) THEN
   INSERT INTO private.delayed_reopened_runback_viewers(match_id,viewer) VALUES(m.id,who) ON CONFLICT(match_id) DO NOTHING;
  ELSE
   INSERT INTO private.delayed_runback_viewers(match_id,viewer) VALUES(m.id,who) ON CONFLICT(match_id) DO NOTHING;
  END IF;
 END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_take_two_review_allowed(e private.delayed_review_events, who uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT (c.game_type<>'take-two' AND (c.game_type<>'crib-lab' OR NOT (c.config->>'sharedDeck')::boolean)) OR c.terminal OR e.kind='child' OR e.actor=who OR EXISTS(
  SELECT FROM private.delayed_current_review_events own WHERE own.child_id=e.child_id AND own.actor=who AND own.kind='attempt' AND own.round=e.round)
 FROM private.delayed_children c WHERE c.id=e.child_id
$function$;

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
  IF (c.game_type='chess' OR c.game_type='ptown-words' AND c.config->>'version'='ptown-words/2') AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type IN('chess','ptown-words') THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
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
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_current_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$;

CREATE OR REPLACE FUNCTION public.delayed_review_ack(p_event uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e private.delayed_review_events;m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO STRICT e FROM private.delayed_current_review_events WHERE id=p_event;
 SELECT * INTO m FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent) FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 IF NOT private.delayed_take_two_review_allowed(e,who) THEN RAISE EXCEPTION 'delayed:review_unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_seen(event_id,viewer) VALUES(e.id,who) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_terms_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_TABLE_NAME='delayed_matches' THEN
  IF (to_jsonb(NEW)-ARRAY['status','accepted_at','settled_at','revision']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','accepted_at','settled_at','revision']) THEN RAISE EXCEPTION 'delayed:frozen_offer'; END IF;
 ELSE
  IF (NEW.id,NEW.match_id,NEW.ordinal,NEW.game_type,NEW.stake,NEW.config) IS DISTINCT FROM
     (OLD.id,OLD.match_id,OLD.ordinal,OLD.game_type,OLD.stake,OLD.config) OR
     (OLD.starter IS NOT NULL AND NEW.starter IS DISTINCT FROM OLD.starter) OR
     (OLD.terminal AND NEW IS DISTINCT FROM OLD AND NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.child_id=OLD.id AND x.transaction_id=txid_current() AND x.executor_role=session_user AND x.before_child=to_jsonb(OLD) AND x.restored_child=to_jsonb(NEW))) THEN RAISE EXCEPTION 'delayed:frozen_child'; END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.delayed_incident_close(p_incident uuid, p_resolution text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE incident private.delayed_incidents;c private.delayed_children;finished timestamptz:=clock_timestamp();shift interval;ms bigint;s jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO STRICT incident FROM private.delayed_incidents WHERE id=p_incident FOR UPDATE;
 IF incident.closed_at IS NOT NULL THEN RETURN;END IF;
 IF length(trim(p_resolution))<8 THEN RAISE EXCEPTION 'delayed:incident_resolution_required';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id) ORDER BY id FOR UPDATE;
 FOR c IN SELECT child_row.* FROM private.delayed_children child_row JOIN private.delayed_matches m ON m.id=child_row.match_id
  WHERE m.status='active' AND NOT child_row.terminal AND (incident.match_id IS NULL OR m.id=incident.match_id) ORDER BY child_row.match_id,child_row.id FOR UPDATE OF child_row LOOP
  shift:=finished-greatest(incident.opened_at,c.available_at);
  IF shift<=interval '0 seconds' THEN CONTINUE;END IF;
  ms:=floor(extract(epoch FROM shift)*1000);shift:=ms*interval '1 millisecond';s:=c.state;
  IF c.game_type IN('ptown-words','chess') AND s->>'deadline' IS NOT NULL THEN s:=jsonb_set(s,'{deadline}',to_jsonb((s->>'deadline')::bigint+ms));END IF;
  IF s#>>'{board,deadline}' IS NOT NULL THEN s:=jsonb_set(s,'{board,deadline}',to_jsonb((s#>>'{board,deadline}')::bigint+ms));END IF;
  IF s#>>'{board,startedAt}' IS NOT NULL THEN s:=jsonb_set(s,'{board,startedAt}',to_jsonb((s#>>'{board,startedAt}')::bigint+ms));END IF;
  IF c.game_type='quintzee' AND (s#>>'{board,celebration,endsAt}')::bigint>floor(extract(epoch FROM incident.opened_at)*1000) THEN
 s:=jsonb_set(s,'{board,celebration}',(s#>'{board,celebration}')||jsonb_build_object(
 'startedAt',(s#>>'{board,celebration,startedAt}')::bigint+ms,
 'countAt',(s#>>'{board,celebration,countAt}')::bigint+ms,
 'endsAt',(s#>>'{board,celebration,endsAt}')::bigint+ms));END IF; IF s->>'segmentStartedAt' IS NOT NULL THEN s:=jsonb_set(s,'{segmentStartedAt}',to_jsonb((s->>'segmentStartedAt')::bigint+ms));END IF;
  UPDATE private.delayed_children SET available_at=available_at+shift,last_call_at=last_call_at+shift,expires_at=expires_at+shift,
   started_at=started_at+shift,gameplay_due_at=gameplay_due_at+shift,state=s,revision=revision+1 WHERE id=c.id;
 END LOOP;
 UPDATE private.delayed_incidents SET closed_at=finished,resolution=jsonb_build_object('note',p_resolution,'policy','measured_hold_duration') WHERE id=incident.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id);
 PERFORM private.delayed_notify(id) FROM private.delayed_matches WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id);
END $function$;

-- A caller supplies identity/evidence, never balances, a board, or a bank value.
CREATE OR REPLACE FUNCTION public.admin_correct_chess_timeout(
 p_request uuid,p_child uuid,p_expected_revision bigint,p_outcome_hash text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;s private.delayed_settlements;
 prior private.delayed_corrections;fp jsonb;restored private.delayed_children;at_i timestamptz:=clock_timestamp();at_ms bigint;
 opening bigint;last_move bigint;bank jsonb;actor_i uuid:=auth.uid();pa public.players;pb public.players;
 ta public.player_transactions;tb public.player_transactions;ra jsonb;rb jsonb;hold uuid;financial_id uuid:=gen_random_uuid();
BEGIN
 IF actor_i IS NULL OR NOT public.has_role(actor_i,'admin'::public.app_role) THEN RAISE EXCEPTION 'chess_correction:not_authorized' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_child IS NULL OR p_expected_revision IS NULL OR p_outcome_hash IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 2000 THEN RAISE EXCEPTION 'chess_correction:identity_and_reason_required';END IF;
 fp:=jsonb_build_object('child',p_child,'revision',p_expected_revision,'outcomeHash',p_outcome_hash,'reason',p_reason);
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO prior FROM private.delayed_corrections WHERE id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM actor_i OR prior.fingerprint IS DISTINCT FROM fp THEN RAISE EXCEPTION 'chess_correction:request_conflict';END IF;
  RETURN jsonb_build_object('id',prior.id,'matchId',prior.match_id,'childId',prior.child_id,'reversalIds',prior.reversal_ids,'outcome','already_corrected');
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF EXISTS(SELECT FROM private.delayed_corrections WHERE match_id=m.id) THEN RAISE EXCEPTION 'chess_correction:already_corrected';END IF;
 SELECT * INTO STRICT o FROM private.delayed_outcomes WHERE child_id=c.id;
 SELECT * INTO STRICT s FROM private.delayed_settlements WHERE match_id=m.id;
 IF m.status<>'settled' OR NOT m.real_money OR NOT c.terminal OR c.game_type<>'chess' OR c.revision<>p_expected_revision
 OR s.outcome_hash<>p_outcome_hash OR s.child_count<>1 OR (SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1
 OR o.reason<>'timeout_forfeit' OR c.state->>'reason'<>'timeout' OR c.state->>'phase'<>'complete'
 OR c.state#>>'{rules,version}'<>'ptown-chess/1' OR c.state#>>'{rules,turnMs}'<>'300000'
 OR o.organizer_delta<>s.organizer_delta OR abs(s.organizer_delta)<>c.stake
 OR c.actor::text IS DISTINCT FROM c.state->'players'->(c.state->>'turnIndex')::int->>'id'
 OR c.state->>'fen' IS DISTINCT FROM coalesce(c.state#>>'{moves,-1,fen}',c.state->>'initialFen')
 OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)
 THEN RAISE EXCEPTION 'chess_correction:evidence_mismatch';END IF;
 SELECT max((fingerprint->>'revision')::bigint) INTO last_move FROM private.chess_requests WHERE mode='async' AND match_id=c.id AND fingerprint#>>'{intent,type}'='move';
 SELECT min((fingerprint->>'revision')::bigint) INTO opening FROM private.chess_requests WHERE mode='async' AND match_id=c.id AND actor=c.actor
 AND fingerprint#>>'{intent,type}'='open' AND (fingerprint->>'revision')::bigint>coalesce(last_move,-1);
 IF opening IS NULL OR c.state->>'opened'<>'true' THEN RAISE EXCEPTION 'chess_correction:turn_receipt_missing';END IF;
 SELECT coalesce(jsonb_agg(slot ORDER BY slot),'[]') INTO bank FROM jsonb_array_elements(c.state->'banks'->c.actor::text) slot
 WHERE NOT EXISTS(SELECT FROM private.chess_requests r WHERE r.mode='async' AND r.match_id=c.id AND r.actor=c.actor
 AND (r.fingerprint->>'revision')::bigint>=opening AND r.fingerprint#>>'{intent,type}'='bank' AND r.fingerprint#>'{intent,slot}'=slot);
 SELECT * INTO STRICT pa FROM public.players WHERE game_id=s.game_id AND user_id=m.organizer AND NOT is_bot FOR UPDATE;
 SELECT * INTO STRICT pb FROM public.players WHERE game_id=s.game_id AND user_id=m.opponent AND NOT is_bot FOR UPDATE;
 SELECT * INTO STRICT ta FROM public.player_transactions WHERE source_game_id=s.game_id AND profile_id=m.organizer AND transaction_type='SessionResult' FOR UPDATE;
 SELECT * INTO STRICT tb FROM public.player_transactions WHERE source_game_id=s.game_id AND profile_id=m.opponent AND transaction_type='SessionResult' FOR UPDATE;
 IF pa.chips<>s.organizer_delta OR pb.chips<>s.opponent_delta OR ta.amount<>s.organizer_delta OR tb.amount<>s.opponent_delta
 OR EXISTS(SELECT FROM public.player_transactions WHERE reversal_of IN(ta.id,tb.id)) THEN RAISE EXCEPTION 'chess_correction:financial_evidence_mismatch';END IF;
 ra:=public.admin_reverse_account_entry(gen_random_uuid(),ta.id,p_reason);
 rb:=public.admin_reverse_account_entry(gen_random_uuid(),tb.id,p_reason);
 PERFORM public.settle_gameplay_chip_transfers(s.game_id,jsonb_build_array(jsonb_build_object(
 'from',jsonb_build_object('kind','player','playerId',CASE WHEN s.organizer_delta>0 THEN pa.id ELSE pb.id END),
 'to',jsonb_build_object('kind','player','playerId',CASE WHEN s.organizer_delta>0 THEN pb.id ELSE pa.id END),
 'amount',abs(s.organizer_delta))),'transfer');
 IF EXISTS(SELECT FROM public.players WHERE id IN(pa.id,pb.id) AND chips<>0) THEN RAISE EXCEPTION 'chess_correction:unbalanced_reversal';END IF;
 at_ms:=floor(extract(epoch FROM at_i)*1000);
 restored:=c;
 restored.state:=(c.state-ARRAY['reason','terminal','movePresentation'])||jsonb_build_object('phase','playing','winnerIds','[]'::jsonb,
 'scores',jsonb_build_object(m.organizer::text,0,m.opponent::text,0),'deadline',at_ms+300000,'clockDuration',300000,'opened',true,
 'banks',jsonb_set(c.state->'banks',ARRAY[c.actor::text],bank));
 restored.terminal:=false;restored.revision:=c.revision+1;restored.segment:=c.segment+1;
 restored.available_at:=at_i;restored.last_call_at:=at_i+interval '24 hours';restored.expires_at:=at_i+interval '36 hours';
 restored.started_at:=at_i;restored.gameplay_due_at:=to_timestamp((at_ms+300000)/1000.0);
 INSERT INTO private.delayed_corrections(id,child_id,match_id,actor,reason,fingerprint,before_child,restored_child,before_parent,original_outcome,original_settlement,reversal_ids,financial_game_id,transaction_id,executor_role,created_at)
 VALUES(p_request,c.id,m.id,actor_i,p_reason,fp,to_jsonb(c),to_jsonb(restored),to_jsonb(m),to_jsonb(o),to_jsonb(s),ARRAY[(ra->>'id')::uuid,(rb->>'id')::uuid],financial_id,txid_current(),session_user,at_i);
 UPDATE private.delayed_children SET state=restored.state,terminal=false,revision=restored.revision,segment=restored.segment,
 available_at=restored.available_at,last_call_at=restored.last_call_at,expires_at=restored.expires_at,started_at=restored.started_at,gameplay_due_at=restored.gameplay_due_at WHERE id=c.id;
 UPDATE private.delayed_matches SET status='active',settled_at=NULL,revision=revision+1 WHERE id=m.id;
 hold:=private.delayed_incident_open(m.id,'Restored Chess timeout correction '||p_request||'; retain hold until explicit owner resume.');
 -- Anchor the restored five minutes to the actual incident hold, including SQL
 -- execution time. Closing the hold shifts both scalar and relational deadlines.
 SELECT floor(extract(epoch FROM opened_at)*1000) INTO at_ms FROM private.delayed_incidents WHERE id=hold;
 UPDATE private.delayed_children SET state=jsonb_set(state,'{deadline}',to_jsonb(at_ms+300000)),gameplay_due_at=to_timestamp((at_ms+300000)/1000.0),revision=revision+1 WHERE id=c.id;
 PERFORM private.delayed_notify(m.id);
 RETURN jsonb_build_object('id',p_request,'matchId',m.id,'childId',c.id,'outcome','corrected_and_held','holdId',hold,'reversalIds',jsonb_build_array(ra->>'id',rb->>'id'),'turnMs',300000,'banks',restored.state->'banks');
END $$;
REVOKE ALL ON FUNCTION public.admin_correct_chess_timeout(uuid,uuid,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_correct_chess_timeout(uuid,uuid,bigint,text,text) TO authenticated;
