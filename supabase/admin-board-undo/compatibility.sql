-- Preserve sibling outcomes when several games in one match are corrected.
CREATE VIEW private.board_undo_child_corrections AS SELECT DISTINCT ON(child_id) * FROM private.delayed_corrections ORDER BY child_id,generation DESC;
REVOKE ALL ON private.board_undo_child_corrections FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE VIEW private.delayed_current_outcomes AS  SELECT o.child_id,
    o.match_id,
    o.terminal_revision,
    o.segment,
    o.reason,
    o.winner,
    o.organizer_delta,
    o.opponent_delta,
    o.evidence,
    o.completed_at
   FROM private.delayed_outcomes o
  WHERE NOT (EXISTS ( SELECT
           FROM private.delayed_corrections x
          WHERE x.child_id = o.child_id)) AND NOT (EXISTS ( SELECT
           FROM private.delayed_timeout_restored_children x
          WHERE x.child_id = o.child_id))
UNION ALL
 SELECT o.child_id,
    o.match_id,
    o.terminal_revision,
    o.segment,
    o.reason,
    o.winner,
    o.organizer_delta,
    o.opponent_delta,
    o.evidence,
    o.completed_at
   FROM private.delayed_reopened_outcomes o
     JOIN private.board_undo_child_corrections x ON x.child_id = o.child_id AND x.generation = o.generation;
CREATE OR REPLACE VIEW private.delayed_current_review_events AS SELECT e.* FROM private.delayed_review_events e WHERE (kind <> 'child'::text OR NOT (EXISTS ( SELECT
           FROM private.delayed_corrections x
          WHERE x.child_id = e.child_id AND e.completed_at < x.created_at)) AND NOT (EXISTS ( SELECT
           FROM private.delayed_timeout_restored_children r
             JOIN private.delayed_corrections x ON x.id = r.correction_id
          WHERE r.child_id = e.child_id AND e.completed_at < x.created_at))) AND NOT EXISTS(SELECT FROM private.board_undo_audits a JOIN private.board_undo_frames f ON f.id=a.frame_id WHERE a.mode='async' AND a.match_id=e.child_id AND e.completed_at<=a.created_at AND (e.kind='child' OR e.round>=(f.before_row#>>'{state,turn}')::int));
CREATE OR REPLACE FUNCTION private.delayed_capture_reviews()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE a jsonb; e uuid; o private.delayed_outcomes; move jsonb;
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT FROM private.board_undo_audits WHERE match_id=NEW.id AND mode='async' AND transaction_id=txid_current() AND NEW.revision=(restored_row->>'revision')::bigint) THEN RETURN NEW;END IF;
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
   VALUES(NEW.id,NEW.match_id,NEW.id||':word:'||(move->>'turn')||coalesce(':'||(NEW.state->>'adminUndoId'),''),'attempt',(move->>'playerId')::uuid,
    (move->>'turn')::int,(move->>'points')::bigint,clock_timestamp(),jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'move',move))
   ON CONFLICT(event_key) DO NOTHING RETURNING id INTO e;
   IF e IS NOT NULL THEN INSERT INTO private.delayed_review_boards VALUES(e,private.delayed_review_board(NEW.game_type,NEW.state));END IF;
  END IF;
 END IF;
 IF NEW.terminal AND NOT OLD.terminal THEN
  SELECT * INTO STRICT o FROM private.delayed_current_outcomes WHERE child_id=NEW.id;
  INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
  VALUES(NEW.id,NEW.match_id,NEW.id||':final'||coalesce((SELECT ':'||id::text FROM private.board_undo_child_corrections WHERE child_id=NEW.id),''),'child',NULL,0,NULL,o.completed_at,
   jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'reason',o.reason,'winner',o.winner,
    'organizerDelta',o.organizer_delta,'opponentDelta',o.opponent_delta,'stake',NEW.stake))
  ON CONFLICT(event_key) DO NOTHING;
 END IF;
 RETURN NEW;
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
 IF c.game_type='chess' AND NOT m.real_money AND reason_i='timeout_forfeit' THEN RAISE EXCEPTION 'chess:untimed';END IF;
 delta_i:=CASE WHEN winner_i=m.organizer THEN c.stake WHEN winner_i=m.opponent THEN -c.stake ELSE 0 END;
 IF EXISTS(SELECT FROM private.board_undo_child_corrections WHERE child_id=c.id) THEN
 INSERT INTO private.delayed_reopened_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence,generation)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i,(SELECT generation FROM private.board_undo_child_corrections WHERE child_id=c.id)) RETURNING child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence,completed_at INTO old;
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
CREATE OR REPLACE FUNCTION private.delayed_words_present_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE config jsonb;move jsonb;squares jsonb;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);announce_at bigint;
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT FROM private.board_undo_audits WHERE match_id=NEW.id AND mode='async' AND transaction_id=txid_current() AND NEW.revision=(restored_row->>'revision')::bigint) THEN RETURN NEW;END IF;
 IF NEW.game_type<>'ptown-words' OR NEW.state IS NULL THEN RETURN NEW;END IF;
 config:=coalesce(OLD.state->'presentationConfig',private.ptown_words_presentation_config());
 NEW.state:=NEW.state||jsonb_build_object('presentationConfig',config);
 IF OLD.state IS NULL OR (NEW.state->>'turn')::int IS NOT DISTINCT FROM (OLD.state->>'turn')::int THEN RETURN NEW;END IF;
 NEW.state:=NEW.state-'movePresentation';move:=NEW.state->'moves'->-1;
 IF (NEW.state->>'turn')::int<>(OLD.state->>'turn')::int+1 OR move->>'action'<>'place' THEN RETURN NEW;END IF;
 SELECT jsonb_agg(i ORDER BY i) INTO squares FROM generate_series(0,224)i WHERE OLD.state->'board'->i='null'::jsonb AND NEW.state->'board'->i<>'null'::jsonb;
 announce_at:=at_ms+(config->>'focusMs')::int+jsonb_array_length(squares)*(config->>'flipMs')::int;
 NEW.state:=NEW.state||jsonb_build_object('movePresentation',jsonb_build_object('version',1,'turn',move->'turn','playerId',move->'playerId',
  'squares',squares,'startedAt',at_ms,'announceAt',announce_at,'readyAt',announce_at+(config->>'noticeMs')::int+(config->>'holdMs')::int,
  'flipMs',config->'flipMs','focusMs',config->'focusMs','noticeMs',config->'noticeMs'));
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.ptown_words_present_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE config jsonb;move jsonb;squares jsonb;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);announce_at bigint;ready_at bigint;delta bigint;
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT FROM private.board_undo_audits WHERE match_id=NEW.dealer_game_id AND mode='live' AND transaction_id=txid_current() AND NEW.revision=(restored_row->>'revision')::bigint) THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN
  SELECT dg.config->'presentation' INTO config FROM public.dealer_games dg WHERE dg.id=NEW.dealer_game_id;
  IF config IS NOT NULL THEN NEW.state:=NEW.state||jsonb_build_object('presentationConfig',config);END IF;
  RETURN NEW;
 END IF;
 config:=OLD.state->'presentationConfig';
 IF config IS NULL THEN RETURN NEW;END IF;
 IF NEW.paused_at IS NULL AND OLD.paused_at IS NOT NULL AND (OLD.state#>>'{movePresentation,readyAt}')::bigint>OLD.paused_at THEN
  delta:=at_ms-OLD.paused_at;
  NEW.state:=jsonb_set(NEW.state,'{movePresentation}',(NEW.state->'movePresentation')||jsonb_build_object(
   'startedAt',(OLD.state#>>'{movePresentation,startedAt}')::bigint+delta,
   'announceAt',(OLD.state#>>'{movePresentation,announceAt}')::bigint+delta,
   'readyAt',(OLD.state#>>'{movePresentation,readyAt}')::bigint+delta));
 END IF;
 IF (NEW.state->>'turn')::int<>(OLD.state->>'turn')::int+1 THEN RETURN NEW;END IF;
 NEW.state:=NEW.state-'movePresentation';move:=NEW.state->'moves'->-1;
 IF move->>'action'<>'place' THEN RETURN NEW;END IF;
 SELECT jsonb_agg(i ORDER BY i) INTO squares FROM generate_series(0,224)i WHERE OLD.state->'board'->i='null'::jsonb AND NEW.state->'board'->i<>'null'::jsonb;
 announce_at:=at_ms+(config->>'focusMs')::int+jsonb_array_length(squares)*(config->>'flipMs')::int;
 ready_at:=announce_at+(config->>'noticeMs')::int+(config->>'holdMs')::int;
 NEW.state:=NEW.state||jsonb_build_object('movePresentation',jsonb_build_object('version',1,'turn',move->'turn','playerId',move->'playerId',
  'squares',squares,'startedAt',at_ms,'announceAt',announce_at,'readyAt',ready_at,'flipMs',config->'flipMs','focusMs',config->'focusMs','noticeMs',config->'noticeMs'));
 IF NEW.state->>'phase'='playing' THEN NEW.state:=jsonb_set(NEW.state,'{deadline}',CASE WHEN coalesce((NEW.state#>>'{rules,timerEnabled}')::boolean,true) THEN to_jsonb(ready_at+(NEW.state#>>'{rules,turnMs}')::int) ELSE 'null'::jsonb END);END IF;
 RETURN NEW;
END $function$
;

