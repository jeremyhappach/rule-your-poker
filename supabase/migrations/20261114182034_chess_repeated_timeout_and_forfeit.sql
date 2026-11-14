-- Repeat corrections append a new generation. Earlier audits and receipts remain immutable.
ALTER TABLE private.delayed_corrections ADD COLUMN generation integer NOT NULL DEFAULT 1 CHECK(generation>0);
ALTER TABLE private.delayed_corrections ADD UNIQUE(match_id,generation),ADD UNIQUE(child_id,generation);
ALTER TABLE private.delayed_reopened_finale_seen DROP CONSTRAINT delayed_reopened_finale_seen_match_id_fkey;
ALTER TABLE private.delayed_reopened_runback_viewers DROP CONSTRAINT delayed_reopened_runback_viewers_match_id_fkey;
ALTER TABLE private.delayed_corrections DROP CONSTRAINT delayed_corrections_child_id_key,DROP CONSTRAINT delayed_corrections_match_id_key;
ALTER TABLE private.delayed_reopened_outcomes ADD COLUMN generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 DROP CONSTRAINT delayed_reopened_outcomes_pkey,ADD PRIMARY KEY(child_id,generation),
 ADD FOREIGN KEY(match_id,generation) REFERENCES private.delayed_corrections(match_id,generation);
ALTER TABLE private.delayed_reopened_settlements ADD COLUMN generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 DROP CONSTRAINT delayed_reopened_settlements_pkey,ADD PRIMARY KEY(match_id,generation),
 ADD FOREIGN KEY(match_id,generation) REFERENCES private.delayed_corrections(match_id,generation);
ALTER TABLE private.delayed_reopened_finale_seen ADD COLUMN generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 DROP CONSTRAINT delayed_reopened_finale_seen_pkey,ADD PRIMARY KEY(match_id,viewer,generation),
 ADD FOREIGN KEY(match_id,generation) REFERENCES private.delayed_corrections(match_id,generation);
ALTER TABLE private.delayed_reopened_runback_viewers ADD COLUMN generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 DROP CONSTRAINT delayed_reopened_runback_viewers_pkey,ADD PRIMARY KEY(match_id,generation),
 ADD FOREIGN KEY(match_id,generation) REFERENCES private.delayed_corrections(match_id,generation);
CREATE VIEW private.delayed_current_corrections AS
 SELECT DISTINCT ON(match_id) * FROM private.delayed_corrections ORDER BY match_id,generation DESC;
REVOKE ALL ON private.delayed_current_corrections FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE VIEW private.delayed_current_outcomes AS
 SELECT o.* FROM private.delayed_outcomes o WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.child_id=o.child_id)
 UNION ALL SELECT o.child_id,o.match_id,o.terminal_revision,o.segment,o.reason,o.winner,o.organizer_delta,o.opponent_delta,o.evidence,o.completed_at FROM private.delayed_reopened_outcomes o
 JOIN private.delayed_current_corrections x ON x.match_id=o.match_id AND x.generation=o.generation;
CREATE OR REPLACE VIEW private.delayed_current_settlements AS
 SELECT s.* FROM private.delayed_settlements s WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.match_id=s.match_id)
 UNION ALL SELECT s.match_id,s.game_id,s.dealer_game_id,s.result_id,s.outcome_hash,s.child_count,s.organizer_delta,s.opponent_delta,s.created_at FROM private.delayed_reopened_settlements s
 JOIN private.delayed_current_corrections x ON x.match_id=s.match_id AND x.generation=s.generation;
CREATE OR REPLACE VIEW private.delayed_current_finale_seen AS
 SELECT s.* FROM private.delayed_finale_seen s WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.match_id=s.match_id)
 UNION ALL SELECT s.match_id,s.viewer,s.seen_at FROM private.delayed_reopened_finale_seen s
 JOIN private.delayed_current_corrections x ON x.match_id=s.match_id AND x.generation=s.generation;
CREATE OR REPLACE VIEW private.delayed_current_runback_viewers AS
 SELECT r.* FROM private.delayed_runback_viewers r WHERE NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.match_id=r.match_id)
 UNION ALL SELECT r.match_id,r.viewer FROM private.delayed_reopened_runback_viewers r
 JOIN private.delayed_current_corrections x ON x.match_id=r.match_id AND x.generation=r.generation;
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
 IF EXISTS(SELECT FROM private.delayed_current_corrections WHERE match_id=m.id) THEN
 INSERT INTO private.delayed_reopened_finale_seen(match_id,viewer,seen_at,generation) VALUES(m.id,who,clock_timestamp(),(SELECT generation FROM private.delayed_current_corrections WHERE match_id=m.id)) ON CONFLICT DO NOTHING;
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
  IF EXISTS(SELECT FROM private.delayed_current_corrections WHERE match_id=m.id) THEN
   INSERT INTO private.delayed_reopened_runback_viewers(match_id,viewer,generation) VALUES(m.id,who,(SELECT generation FROM private.delayed_current_corrections WHERE match_id=m.id)) ON CONFLICT(match_id,generation) DO NOTHING;
  ELSE
   INSERT INTO private.delayed_runback_viewers(match_id,viewer) VALUES(m.id,who) ON CONFLICT(match_id) DO NOTHING;
  END IF;
 END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $function$
;
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
 SELECT coalesce((SELECT financial_game_id FROM private.delayed_current_corrections WHERE match_id=parent),parent) INTO financial_id;
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
 INSERT INTO private.delayed_reopened_settlements(match_id,game_id,dealer_game_id,result_id,outcome_hash,child_count,organizer_delta,opponent_delta,generation)
 VALUES(parent,financial_id,dg,result_id,hash,n,net_i,-net_i,(SELECT generation FROM private.delayed_current_corrections WHERE match_id=parent)) RETURNING match_id,game_id,dealer_game_id,private.delayed_reopened_settlements.result_id,outcome_hash,child_count,organizer_delta,opponent_delta,created_at INTO receipt;
 ELSE
 INSERT INTO private.delayed_settlements(match_id,game_id,dealer_game_id,result_id,outcome_hash,child_count,organizer_delta,opponent_delta)
 VALUES(parent,financial_id,dg,result_id,hash,n,net_i,-net_i) RETURNING * INTO receipt;
 END IF;
 UPDATE private.delayed_matches SET status='settled',settled_at=clock_timestamp(),revision=revision+1 WHERE id=parent;
 PERFORM private.delayed_notify(parent);
 RETURN to_jsonb(receipt);
END $function$
;
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
 IF EXISTS(SELECT FROM private.delayed_current_corrections WHERE child_id=child) THEN
 INSERT INTO private.delayed_reopened_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence,generation)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i,(SELECT generation FROM private.delayed_current_corrections WHERE child_id=child)) RETURNING child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence,completed_at INTO old;
 ELSE
 INSERT INTO private.delayed_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i) RETURNING * INTO old;
 END IF;
 UPDATE private.delayed_children SET terminal=true,revision=revision+1 WHERE id=c.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_finalize(m.id);
 PERFORM private.delayed_notify(m.id);
 RETURN to_jsonb(old);
END $function$
;
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
  'correction',(SELECT jsonb_build_object('id',id,'reason',reason,'at',created_at,'originalResult',original_outcome,'reversed',true) FROM private.delayed_current_corrections WHERE match_id=m.id),'held',private.delayed_held(m.id),'lineup',lineup,'net',net,'completed',finished,
  'exposure',(SELECT sum(stake) FROM private.delayed_children WHERE match_id=m.id),
  'receipt',(SELECT to_jsonb(s) FROM private.delayed_current_settlements s WHERE match_id=m.id),
  'removedAt',(SELECT removed_at FROM private.delayed_removals WHERE match_id=m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
;
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
  VALUES(NEW.id,NEW.match_id,NEW.id||':final'||coalesce((SELECT ':'||id::text FROM private.delayed_current_corrections WHERE child_id=NEW.id),''),'child',NULL,0,NULL,o.completed_at,
   jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'reason',o.reason,'winner',o.winner,
    'organizerDelta',o.organizer_delta,'opponentDelta',o.opponent_delta,'stake',NEW.stake))
  ON CONFLICT(event_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.admin_correct_chess_timeout(p_request uuid, p_child uuid, p_expected_revision bigint, p_outcome_hash text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;s private.delayed_settlements;
 prior private.delayed_corrections;fp jsonb;restored private.delayed_children;at_i timestamptz:=clock_timestamp();at_ms bigint;
 opening bigint;last_move bigint;bank jsonb;actor_i uuid:=auth.uid();pa public.players;pb public.players;
 ta public.player_transactions;tb public.player_transactions;ra jsonb;rb jsonb;generation_i integer;financial_id uuid:=gen_random_uuid();
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
 SELECT coalesce(max(generation),0)+1 INTO generation_i FROM private.delayed_corrections WHERE match_id=m.id;
 SELECT * INTO STRICT o FROM private.delayed_current_outcomes WHERE child_id=c.id;
 SELECT * INTO STRICT s FROM private.delayed_current_settlements WHERE match_id=m.id;
 IF private.delayed_held(m.id) OR m.status<>'settled' OR NOT m.real_money OR NOT c.terminal OR c.game_type<>'chess' OR c.revision<>p_expected_revision
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
 'scores',jsonb_build_object(m.organizer::text,0,m.opponent::text,0),'deadline',at_ms+129600000,'clockDuration',300000,'opened',false,
 'banks',jsonb_set(c.state->'banks',ARRAY[c.actor::text],bank));
 restored.terminal:=false;restored.revision:=c.revision+1;restored.segment:=c.segment+1;
 restored.available_at:=at_i;restored.last_call_at:=at_i+interval '24 hours';restored.expires_at:=at_i+interval '36 hours';
 restored.started_at:=NULL;restored.gameplay_due_at:=NULL;
 INSERT INTO private.delayed_corrections(id,child_id,match_id,actor,reason,fingerprint,before_child,restored_child,before_parent,original_outcome,original_settlement,reversal_ids,financial_game_id,transaction_id,executor_role,created_at,generation)
 VALUES(p_request,c.id,m.id,actor_i,p_reason,fp,to_jsonb(c),to_jsonb(restored),to_jsonb(m),to_jsonb(o),to_jsonb(s),ARRAY[(ra->>'id')::uuid,(rb->>'id')::uuid],financial_id,txid_current(),session_user,at_i,generation_i);
 UPDATE private.delayed_children SET state=restored.state,terminal=false,revision=restored.revision,segment=restored.segment,
 available_at=restored.available_at,last_call_at=restored.last_call_at,expires_at=restored.expires_at,started_at=restored.started_at,gameplay_due_at=restored.gameplay_due_at WHERE id=c.id;
 UPDATE private.delayed_matches SET status='active',settled_at=NULL,revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_notify(m.id);
 RETURN jsonb_build_object('id',p_request,'matchId',m.id,'childId',c.id,'outcome','corrected_unopened','generation',generation_i,'reversalIds',jsonb_build_array(ra->>'id',rb->>'id'),'turnMs',300000,'banks',restored.state->'banks');
END $function$
;
CREATE OR REPLACE FUNCTION private.chess_commit_impl(p_mode text, p_id uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_request uuid, p_fingerprint jsonb, p_bot boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE row_i jsonb;before_s jsonb;prior private.chess_requests;c private.delayed_children;winner uuid;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);changed_turn boolean;
BEGIN
 IF NOT p_bot THEN PERFORM private.chess_authorize(p_mode,p_id,p_actor);
 ELSIF p_mode<>'live' THEN RAISE EXCEPTION 'chess:bot_mode';END IF;
 PERFORM private.chess_sync(p_mode,p_id);
 row_i:=private.chess_record(p_mode,p_id,CASE WHEN p_bot THEN NULL ELSE p_actor END);before_s:=row_i->'state';
 IF p_bot THEN
  IF NOT EXISTS(SELECT FROM private.chess_matches m JOIN public.games g ON g.id=m.game_id JOIN public.players p ON p.game_id=g.id WHERE m.dealer_game_id=p_id AND p.id=p_actor AND p.is_bot AND g.real_money=false)
    OR NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=p_actor::text AND (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'chess:bot_actor';END IF;
  row_i:=row_i||jsonb_build_object('viewerId',p_actor);
 END IF;
 SELECT * INTO prior FROM private.chess_requests WHERE mode=p_mode AND match_id=p_id AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM p_actor OR prior.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'chess:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','duplicate','record',row_i);
 END IF;
 IF p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'chess:request_required';END IF;
 IF (row_i->>'revision')::bigint IS DISTINCT FROM p_revision OR (row_i->>'settled')::boolean OR (row_i->>'paused')::boolean OR before_s->>'phase'<>'playing' THEN RETURN jsonb_build_object('outcome','stale','record',row_i);END IF;
 -- Forfeit is available to either authorized participant. It cannot alter the board or award the actor a win.
 IF p_fingerprint#>>'{intent,type}'='resign' THEN
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=row_i->>'viewerId')
   OR p_state->>'phase' IS DISTINCT FROM 'complete' OR p_state->>'reason' IS DISTINCT FROM 'resignation'
   OR p_state->'winnerIds' IS DISTINCT FROM (SELECT jsonb_agg(p->'id') FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'<>row_i->>'viewerId')
   OR (p_state-ARRAY['phase','reason','winnerIds','scores']) IS DISTINCT FROM (before_s-ARRAY['phase','reason','winnerIds','scores'])
   OR p_state->'scores' IS DISTINCT FROM (SELECT jsonb_object_agg(p->>'id',CASE WHEN p->>'id'=row_i->>'viewerId' THEN 0 ELSE 1 END) FROM jsonb_array_elements(before_s->'players') p)
  THEN RAISE EXCEPTION 'chess:invalid_forfeit';END IF;
 ELSIF before_s->'players'->(before_s->>'turnIndex')::int->>'id' IS DISTINCT FROM row_i->>'viewerId' THEN RAISE EXCEPTION 'chess:not_your_turn';END IF;
 IF p_state->'bot' IS DISTINCT FROM before_s->'bot' THEN RAISE EXCEPTION 'chess:bot_config_changed';END IF;
 IF p_state->'identity' IS DISTINCT FROM before_s->'identity' OR p_state->'rules' IS DISTINCT FROM before_s->'rules' OR p_state->'players' IS DISTINCT FROM before_s->'players' OR p_state->'backgroundId' IS DISTINCT FROM before_s->'backgroundId' OR p_state->'initialFen' IS DISTINCT FROM before_s->'initialFen' OR p_state->'mode' IS DISTINCT FROM before_s->'mode' THEN RAISE EXCEPTION 'chess:identity_changed';END IF;
 -- Only the authenticated Node authority can reach this full-state boundary.
 -- Enforce append-only moves and exact rule/config identity again under row lock.
 IF jsonb_array_length(p_state->'moves') NOT BETWEEN jsonb_array_length(before_s->'moves') AND jsonb_array_length(before_s->'moves')+1 OR EXISTS(SELECT FROM jsonb_array_elements(before_s->'moves') WITH ORDINALITY t(m,n) WHERE p_state->'moves'->(n::int-1) IS DISTINCT FROM m) THEN RAISE EXCEPTION 'chess:history_changed';END IF;
 IF p_state->>'phase'='complete' AND (jsonb_array_length(p_state->'winnerIds') NOT BETWEEN 1 AND 2 OR EXISTS(SELECT FROM jsonb_array_elements_text(p_state->'winnerIds') w WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=w))) THEN RAISE EXCEPTION 'chess:invalid_winner';END IF;
 IF p_mode='live' THEN
  UPDATE private.chess_matches SET state=p_state,revision=revision+1 WHERE dealer_game_id=p_id;
  IF p_state->>'phase'='complete' THEN PERFORM private.chess_settle(p_id);END IF;
 ELSE
  changed_turn:=p_state->'turn' IS DISTINCT FROM before_s->'turn';
  UPDATE private.delayed_children SET state=p_state,revision=revision+1,actor=(p_state->'players'->(p_state->>'turnIndex')::int->>'id')::uuid,
   segment=segment+CASE WHEN changed_turn THEN 1 ELSE 0 END,
   started_at=CASE WHEN changed_turn THEN NULL WHEN (p_state->>'opened')::boolean THEN coalesce(started_at,to_timestamp(at_ms/1000.0)) ELSE started_at END,
   available_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0) ELSE available_at END,
   last_call_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '24 hours' ELSE last_call_at END,
   expires_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '36 hours' ELSE expires_at END,
   gameplay_due_at=CASE WHEN (p_state->>'opened')::boolean THEN to_timestamp((p_state->>'deadline')::bigint/1000.0) END
   WHERE id=p_id RETURNING * INTO c;
  IF p_state->>'phase'='complete' THEN
   winner:=CASE WHEN jsonb_array_length(p_state->'winnerIds')=1 THEN (p_state->'winnerIds'->>0)::uuid END;
   PERFORM private.delayed_record_outcome(p_id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,jsonb_build_object('game','chess','reason',p_state->>'reason','fen',p_state->>'fen'));
  ELSE UPDATE private.delayed_matches SET revision=revision+1 WHERE id=c.match_id;PERFORM private.delayed_notify(c.match_id);END IF;
 END IF;
 INSERT INTO private.chess_requests VALUES(p_mode,p_id,p_request,p_actor,p_fingerprint);
 RETURN jsonb_build_object('outcome','committed','record',private.chess_record(p_mode,p_id,p_actor));
END $function$
;
