-- Approved Hap/TheOG incident: materialize the missing corrected result receipt.
-- Never recalculate outcomes, acknowledge viewing, advance play or settle here.
DO $repair$
DECLARE c private.delayed_children;o private.delayed_outcomes;correction uuid;key_i text;receipt_i jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(731907241);
 PERFORM 1 FROM private.delayed_matches WHERE id='678aebe0-29ff-4a0e-a4f1-0282ea622afc' FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='f749e475-e29d-48e1-be9f-10499d51caf3' FOR UPDATE;
 SELECT * INTO STRICT o FROM private.delayed_current_outcomes WHERE child_id=c.id;
 SELECT id INTO STRICT correction FROM private.delayed_effective_child_corrections WHERE child_id=c.id;
 IF c.match_id<>'678aebe0-29ff-4a0e-a4f1-0282ea622afc' OR c.game_type<>'quintzee' OR NOT c.terminal
  OR c.revision<>193 OR c.segment<>6 OR md5(c.state::text)<>'bd4005ad410968266c6051b06d30a847'
  OR o.terminal_revision<>192 OR o.segment<>6 OR o.reason<>'normal'
  OR o.winner IS DISTINCT FROM 'ad62c2da-2956-4e82-857f-bc0eeef5e858'::uuid
  OR o.organizer_delta<>5 OR o.opponent_delta<>-5
  OR o.completed_at<>'2026-11-21T13:14:26.275024Z'::timestamptz
  OR correction<>'a4c2e884-b81b-4700-9b9b-a73f667adfab' THEN
  RAISE EXCEPTION 'async_flow:incident_preimage_changed';
 END IF;
 key_i:=c.id||':final:'||correction;
 receipt_i:=jsonb_build_object('game',c.game_type,'rules',c.config,'reason',o.reason,'winner',o.winner,
  'organizerDelta',o.organizer_delta,'opponentDelta',o.opponent_delta,'stake',c.stake);
 IF EXISTS(SELECT FROM private.delayed_review_events e WHERE e.event_key=key_i
  AND (e.child_id,e.match_id,e.kind,e.completed_at,e.receipt) IS DISTINCT FROM (c.id,c.match_id,'child'::text,o.completed_at,receipt_i)) THEN
  RAISE EXCEPTION 'async_flow:receipt_conflict';
 END IF;
 INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
 VALUES(c.id,c.match_id,key_i,'child',NULL,0,NULL,o.completed_at,receipt_i)
 ON CONFLICT(event_key) DO NOTHING;
 PERFORM private.delayed_notify(c.match_id);
END $repair$;
