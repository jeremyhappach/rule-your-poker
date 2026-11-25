-- Private checkpoints, audited administrator rollback, canonical financial reversal.
-- Private exact before-images. Only committed moves/timeouts create a checkpoint.
ALTER TABLE public.games ADD COLUMN admin_board_undo_id uuid;
CREATE TABLE private.board_undo_frames(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL,game_type text NOT NULL,
 match_id uuid NOT NULL,session_id uuid NOT NULL,revision bigint NOT NULL,
 actor uuid NOT NULL,kind text NOT NULL,before_row jsonb NOT NULL,after_state jsonb NOT NULL,
 session_before jsonb NOT NULL,round_before jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(mode,game_type,match_id,revision)
);
CREATE TABLE private.board_undo_audits(
 id uuid PRIMARY KEY,frame_id uuid NOT NULL UNIQUE REFERENCES private.board_undo_frames(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),mode text NOT NULL,game_type text NOT NULL,
 match_id uuid NOT NULL,session_id uuid NOT NULL,expected_revision bigint NOT NULL,
 before_row jsonb NOT NULL,restored_row jsonb NOT NULL,financial_before jsonb NOT NULL,
 reversal_ids uuid[] NOT NULL,transaction_id bigint NOT NULL DEFAULT txid_current(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX board_undo_frame_latest ON private.board_undo_frames(mode,game_type,match_id,revision DESC);
ALTER TABLE private.board_undo_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.board_undo_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.board_undo_frames,private.board_undo_audits FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER board_undo_frame_immutable BEFORE UPDATE OR DELETE ON private.board_undo_frames FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER board_undo_audit_immutable BEFORE UPDATE OR DELETE ON private.board_undo_audits FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();

CREATE FUNCTION private.board_undo_capture() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE mode_i text;game_i text;id_i uuid;session_i uuid;parent_i jsonb;round_i jsonb;kind_i text;actor_i uuid;
BEGIN
 IF TG_TABLE_NAME='delayed_children' THEN
  IF NEW.game_type NOT IN ('chess','ptown-words') THEN RETURN NEW;END IF;
  mode_i:='async';game_i:=NEW.game_type;id_i:=NEW.id;session_i:=NEW.match_id;
 ELSE mode_i:='live';game_i:=CASE TG_TABLE_NAME WHEN 'chess_matches' THEN 'chess' ELSE 'ptown-words' END;
  id_i:=NEW.dealer_game_id;session_i:=NEW.game_id;
 END IF;
 IF OLD.state->>'phase' IS DISTINCT FROM 'playing' OR NOT (coalesce((NEW.state->>'turn')::int,0)>coalesce((OLD.state->>'turn')::int,0)
   OR (mode_i='async' AND to_jsonb(NEW)->>'terminal'='true' AND to_jsonb(OLD)->>'terminal'='false')
   OR (NEW.state->>'phase'='complete' AND OLD.state->>'phase'<>'complete')) THEN RETURN NEW;END IF;
 IF NEW.state->>'reason'='resignation' THEN RETURN NEW;END IF;
 IF EXISTS(SELECT FROM private.board_undo_audits a WHERE a.match_id=id_i AND a.mode=mode_i AND a.transaction_id=txid_current() AND NEW.revision=(a.restored_row->>'revision')::bigint) THEN RETURN NEW;END IF;
 IF mode_i='async' THEN SELECT to_jsonb(m) INTO parent_i FROM private.delayed_matches m WHERE id=session_i;
 ELSE SELECT to_jsonb(g) INTO parent_i FROM public.games g WHERE id=session_i;SELECT to_jsonb(r) INTO round_i FROM public.rounds r WHERE id=NEW.round_id;END IF;
 actor_i:=(OLD.state->'players'->(OLD.state->>'turnIndex')::int->>'userId')::uuid;
 kind_i:=CASE WHEN NEW.state->>'reason'='timeout' OR NEW.state#>>'{moves,-1,reason}'='timeout' OR
 (mode_i='async' AND EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=id_i AND reason='timeout_forfeit')) THEN 'timeout' ELSE 'move' END;
 INSERT INTO private.board_undo_frames(mode,game_type,match_id,session_id,revision,actor,kind,before_row,after_state,session_before,round_before)
 VALUES(mode_i,game_i,id_i,session_i,NEW.revision,actor_i,kind_i,to_jsonb(OLD),NEW.state,parent_i,round_i);
 RETURN NEW;
END $$;
CREATE TRIGGER board_undo_capture AFTER UPDATE OF state ON private.chess_matches FOR EACH ROW EXECUTE FUNCTION private.board_undo_capture();
CREATE TRIGGER board_undo_capture AFTER UPDATE OF state ON private.ptown_words_matches FOR EACH ROW EXECUTE FUNCTION private.board_undo_capture();
CREATE TRIGGER board_undo_capture AFTER UPDATE OF state,terminal ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.board_undo_capture();

-- Existing financial entries remain immutable. A reopened Live session receives
-- a new posting generation only after the previous posting was reversed.
ALTER TABLE public.player_transactions ADD COLUMN session_result_generation integer NOT NULL DEFAULT 0 CHECK(session_result_generation>=0);
DROP INDEX public.player_transactions_session_result_game_profile_key;
CREATE UNIQUE INDEX player_transactions_session_result_game_profile_key ON public.player_transactions(source_game_id,profile_id,session_result_generation)
 WHERE transaction_type='SessionResult' AND source_game_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.record_session_results() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p record;generation_i integer;
BEGIN
 IF NEW.status IN ('completed','session_ended') AND OLD.status NOT IN ('completed','session_ended') AND NEW.real_money THEN
  IF EXISTS(SELECT FROM private.owner_close_audit a WHERE a.target_id=NEW.id AND a.kind='regular' AND a.transaction_id=txid_current() AND a.executor_role=session_user AND a.intent='close_without_posting') THEN RETURN NEW;END IF;
  SELECT count(*) INTO generation_i FROM private.board_undo_audits WHERE mode='live' AND session_id=NEW.id AND jsonb_array_length(financial_before->'accountEntries')>0;
  FOR p IN SELECT DISTINCT ON(user_id) user_id,chips FROM public.session_player_snapshots WHERE game_id=NEW.id AND NOT is_bot ORDER BY user_id,created_at DESC LOOP
   INSERT INTO public.player_transactions(profile_id,transaction_type,amount,notes,source_game_id,session_result_generation)
   SELECT p.user_id,'SessionResult',p.chips,coalesce(NEW.name,'Unnamed Session'),NEW.id,generation_i WHERE EXISTS(SELECT FROM public.profiles WHERE id=p.user_id)
   ON CONFLICT(source_game_id,profile_id,session_result_generation) WHERE transaction_type='SessionResult' AND source_game_id IS NOT NULL DO NOTHING;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION private.board_undo_authorize() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'board_undo:admin_required' USING ERRCODE='42501';END IF;
 RETURN auth.uid();
END $$;
CREATE FUNCTION private.board_undo_row(mode_i text,game_i text,id_i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 IF mode_i='async' THEN SELECT to_jsonb(c) INTO answer FROM private.delayed_children c WHERE id=id_i AND game_type=game_i;
 ELSIF mode_i='live' AND game_i='chess' THEN SELECT to_jsonb(m) INTO answer FROM private.chess_matches m WHERE dealer_game_id=id_i;
 ELSIF mode_i='live' AND game_i='ptown-words' THEN SELECT to_jsonb(m) INTO answer FROM private.ptown_words_matches m WHERE dealer_game_id=id_i;
 END IF;
 IF answer IS NULL THEN RAISE EXCEPTION 'board_undo:match_not_found';END IF;
 RETURN answer;
END $$;
CREATE FUNCTION public.admin_board_undo_info(p_mode text,p_game text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=private.board_undo_authorize();r jsonb;f private.board_undo_frames;reason_i text;
BEGIN
 r:=private.board_undo_row(p_mode,p_game,p_id);
 SELECT * INTO f FROM private.board_undo_frames WHERE mode=p_mode AND game_type=p_game AND match_id=p_id ORDER BY revision DESC LIMIT 1;
 IF f.id IS NULL THEN reason_i:='Saved state unavailable for this older move.';
 ELSIF EXISTS(SELECT FROM private.board_undo_audits WHERE frame_id=f.id) THEN reason_i:='This move has already been undone.';
 ELSIF f.kind<>'timeout' AND f.actor=who THEN reason_i:='The last move was your own move.';
 ELSIF r#>'{state,moves}' IS DISTINCT FROM f.after_state->'moves' OR r#>'{state,turn}' IS DISTINCT FROM f.after_state->'turn'
  OR r#>'{state,phase}' IS DISTINCT FROM f.after_state->'phase' OR r#>'{state,reason}' IS DISTINCT FROM f.after_state->'reason' THEN reason_i:='The match has advanced beyond this checkpoint.';
 ELSIF p_mode='live' AND EXISTS(SELECT FROM public.dealer_games d WHERE d.session_id=f.session_id AND d.id<>f.match_id AND d.created_at>(SELECT created_at FROM public.dealer_games WHERE id=f.match_id)) THEN reason_i:='A later game has started in this session.';
 END IF;
 RETURN jsonb_build_object('available',reason_i IS NULL,'reason',reason_i,'revision',(r->>'revision')::bigint,'kind',f.kind,'sessionId',coalesce(r->>'game_id',r->>'match_id'));
END $$;
REVOKE ALL ON FUNCTION public.admin_board_undo_info(text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_board_undo_info(text,text,uuid) TO authenticated;

CREATE FUNCTION public.admin_board_undo_matches(p_session uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.board_undo_authorize();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'game',game)),'[]') FROM (
  SELECT dealer_game_id id,'chess' game FROM private.chess_matches WHERE game_id=p_session
  UNION ALL SELECT dealer_game_id,'ptown-words' FROM private.ptown_words_matches WHERE game_id=p_session
 ) x);
END $$;
REVOKE ALL ON FUNCTION public.admin_board_undo_matches(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_board_undo_matches(uuid) TO authenticated;

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


CREATE FUNCTION public.admin_board_undo(p_request uuid,p_mode text,p_game text,p_id uuid,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=private.board_undo_authorize();r jsonb;restored jsonb;s jsonb;info jsonb;
 f private.board_undo_frames;prior private.board_undo_audits;g public.games;oldg public.games;oldr public.rounds;
 c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;sett private.delayed_settlements;
 result_i public.game_results;batch_i public.gameplay_transfer_batches;entry public.player_transactions;
 inverse_i jsonb;reversals uuid[]:='{}';financial_i jsonb:='{}';account_i jsonb:='[]';reply jsonb;
 generation_i integer;at_i timestamptz:=clock_timestamp();at_ms bigint;remaining_i bigint;financial_id uuid;
 expiry_i timestamptz;started_i boolean;net_i jsonb;
BEGIN
 IF p_request IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'board_undo:request_required';END IF;
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO prior FROM private.board_undo_audits WHERE id=p_request;
 IF FOUND THEN
  IF (prior.actor,prior.mode,prior.game_type,prior.match_id,prior.expected_revision) IS DISTINCT FROM (who,p_mode,p_game,p_id,p_revision) THEN RAISE EXCEPTION 'board_undo:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','already_undone','sessionId',prior.session_id,'revision',(prior.restored_row->>'revision')::bigint);
 END IF;
 r:=private.board_undo_row(p_mode,p_game,p_id);
 IF p_mode='async' THEN
  SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(r->>'match_id')::uuid FOR UPDATE;
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_id FOR UPDATE;r:=to_jsonb(c);
  IF private.delayed_held(m.id) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'board_undo:match_unavailable';END IF;
 ELSE
  PERFORM 1 FROM public.rounds WHERE id=(r->>'round_id')::uuid FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=(r->>'game_id')::uuid FOR UPDATE;
  IF p_game='chess' THEN PERFORM 1 FROM private.chess_matches WHERE dealer_game_id=p_id FOR UPDATE;
  ELSE PERFORM 1 FROM private.ptown_words_matches WHERE dealer_game_id=p_id FOR UPDATE;END IF;
  r:=private.board_undo_row(p_mode,p_game,p_id);
 END IF;
 IF (r->>'revision')::bigint<>p_revision THEN RAISE EXCEPTION 'board_undo:match_changed';END IF;
 info:=public.admin_board_undo_info(p_mode,p_game,p_id);
 IF NOT (info->>'available')::boolean THEN RAISE EXCEPTION 'board_undo:%',info->>'reason';END IF;
 SELECT * INTO STRICT f FROM private.board_undo_frames WHERE mode=p_mode AND game_type=p_game AND match_id=p_id ORDER BY revision DESC LIMIT 1;
 at_ms:=floor(extract(epoch FROM at_i)*1000);
 s:=f.before_row->'state';
 -- Rebase remaining turn time, not an old wall-clock timestamp. A timeout
 -- restores one standard turn window; untimed games retain null deadlines.
 remaining_i:=CASE WHEN s->>'deadline' IS NULL THEN NULL WHEN f.kind='timeout' THEN
  coalesce((s->>'clockDuration')::bigint,(s#>>'{rules,turnMs}')::bigint)
  ELSE greatest(0,(s->>'deadline')::bigint-coalesce((f.before_row->>'paused_at')::bigint,floor(extract(epoch FROM f.created_at)*1000)::bigint)) END;
 s:=(s-ARRAY['terminal','movePresentation'])||jsonb_build_object('adminUndoId',p_request,'deadline',CASE WHEN remaining_i IS NOT NULL THEN at_ms+remaining_i END);
 IF s ? 'turnStartedAt' THEN s:=s||jsonb_build_object('turnStartedAt',at_ms);END IF;
 restored:=f.before_row||jsonb_build_object('state',s,'revision',p_revision+1);
 IF p_mode='async' THEN
  started_i:=f.before_row->>'started_at' IS NOT NULL;
  expiry_i:=CASE WHEN f.before_row->>'expires_at' IS NOT NULL THEN at_i+CASE WHEN f.kind='timeout' THEN interval '72 hours' ELSE greatest(interval '0 seconds',(f.before_row->>'expires_at')::timestamptz-f.created_at) END END;
  IF NOT started_i AND expiry_i IS NOT NULL OR c.config->>'version'='ptown-words/3' THEN
   s:=s||jsonb_build_object('deadline',floor(extract(epoch FROM expiry_i)*1000)::bigint);
   restored:=restored||jsonb_build_object('state',s);
  END IF;
  restored:=restored||jsonb_build_object('terminal',false,'segment',c.segment+1,'actor',s->'players'->(s->>'turnIndex')::int->'id',
   'available_at',expiry_i-interval '72 hours','last_call_at',expiry_i-interval '24 hours','expires_at',expiry_i,
   'started_at',CASE WHEN started_i THEN at_i END,
   'gameplay_due_at',CASE WHEN remaining_i IS NOT NULL AND started_i THEN to_timestamp((at_ms+remaining_i)/1000.0) END);
  SELECT * INTO o FROM private.delayed_current_outcomes WHERE child_id=c.id;
  SELECT * INTO sett FROM private.delayed_current_settlements WHERE match_id=m.id;
  IF sett.match_id IS NOT NULL THEN
   financial_id:=sett.game_id;
   SELECT * INTO result_i FROM public.game_results WHERE id=sett.result_id;
   SELECT * INTO batch_i FROM public.gameplay_transfer_batches WHERE game_id=sett.game_id AND dealer_game_id=sett.dealer_game_id AND reason='win' AND result_i.pot_won>0 ORDER BY cursor DESC LIMIT 1;
  END IF;
 ELSE
  oldg:=jsonb_populate_record(NULL::public.games,f.session_before);oldr:=jsonb_populate_record(NULL::public.rounds,f.round_before);
  IF EXISTS(SELECT FROM public.players p WHERE p.game_id=g.id AND p.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(s->'players')x) AND (p.status='left' OR p.position IS NULL)) THEN RAISE EXCEPTION 'board_undo:participant_left';END IF;
  SELECT * INTO result_i FROM public.game_results WHERE dealer_game_id=p_id AND settlement_key=CASE p_game WHEN 'chess' THEN 'chess_terminal' ELSE 'ptown_words_terminal' END;
  IF result_i.id IS NOT NULL THEN
   financial_id:=g.id;
   SELECT * INTO batch_i FROM public.gameplay_transfer_batches WHERE game_id=g.id AND dealer_game_id=p_id AND reason='win' AND result_i.pot_won>0 ORDER BY cursor DESC LIMIT 1;
  END IF;
  restored:=restored||jsonb_build_object('settlement',NULL,'finished',false,'paused_at',CASE WHEN g.is_paused THEN at_ms END);
  -- Restore only this game's lifecycle; never overwrite a later dealer game.
  UPDATE public.games SET admin_board_undo_id=p_request,status='in_progress',game_type=p_game,current_game_uuid=p_id,current_round=oldg.current_round,
   total_hands=oldg.total_hands,dealer_position=oldg.dealer_position,config_complete=true,
   session_ended_at=NULL,game_over_at=NULL,last_round_result=oldg.last_round_result,
   pending_session_end=oldg.pending_session_end,awaiting_next_round=false,config_deadline=NULL,ante_decision_deadline=NULL WHERE id=g.id;
 END IF;
 IF financial_id IS NOT NULL THEN
  IF result_i.pot_won>0 AND batch_i.id IS NULL THEN RAISE EXCEPTION 'board_undo:financial_receipt_unavailable';END IF;
  IF batch_i.id IS NOT NULL THEN
   SELECT jsonb_object_agg(id,amount) INTO net_i FROM (SELECT id,sum(amount) amount FROM (
    SELECT t#>>'{from,playerId}' id,-(t->>'amount')::int amount FROM jsonb_array_elements(batch_i.transfers)t
    UNION ALL SELECT t#>>'{to,playerId}',(t->>'amount')::int FROM jsonb_array_elements(batch_i.transfers)t
   ) x GROUP BY id HAVING sum(amount)<>0) n;
   IF EXISTS(SELECT FROM jsonb_each_text(result_i.player_chip_changes) x WHERE x.value::int<>coalesce((net_i->>x.key)::int,0))
    OR EXISTS(SELECT FROM jsonb_each_text(net_i) x WHERE x.value::int<>coalesce((result_i.player_chip_changes->>x.key)::int,0)) THEN RAISE EXCEPTION 'board_undo:financial_receipt_mismatch';END IF;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO account_i FROM public.player_transactions t
   WHERE source_game_id=financial_id AND transaction_type='SessionResult' AND NOT EXISTS(SELECT FROM public.player_transactions v WHERE v.reversal_of=t.id);
  FOR entry IN SELECT * FROM public.player_transactions WHERE id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(account_i)x) ORDER BY profile_id FOR UPDATE LOOP
   reply:=public.admin_reverse_account_entry(gen_random_uuid(),entry.id,'Admin undo of '||p_game||' move or timeout '||p_request);
   reversals:=array_append(reversals,(reply->>'id')::uuid);
  END LOOP;
  IF batch_i.id IS NOT NULL THEN
   IF batch_i.unmatched_deltas<>'{}'::jsonb THEN RAISE EXCEPTION 'board_undo:unbalanced_original';END IF;
   SELECT jsonb_agg(jsonb_build_object('from',t->'to','to',t->'from','amount',t->'amount') ORDER BY n DESC) INTO inverse_i FROM jsonb_array_elements(batch_i.transfers) WITH ORDINALITY x(t,n);
   IF jsonb_array_length(inverse_i)>0 THEN PERFORM public.settle_gameplay_chip_transfers(financial_id,inverse_i,'transfer');END IF;
  END IF;
 END IF;
 financial_i:=jsonb_build_object('result',to_jsonb(result_i),'batch',to_jsonb(batch_i),'accountEntries',account_i,'settlement',to_jsonb(sett),'outcome',to_jsonb(o));
 INSERT INTO private.board_undo_audits(id,frame_id,actor,mode,game_type,match_id,session_id,expected_revision,before_row,restored_row,financial_before,reversal_ids)
 VALUES(p_request,f.id,who,p_mode,p_game,p_id,f.session_id,p_revision,r,restored,financial_i,reversals);
 IF p_mode='async' THEN
  -- Use the established correction generation so original financial receipts
  -- remain available for audit and the next completion settles afresh.
  SELECT coalesce(max(generation),0)+1 INTO generation_i FROM private.delayed_corrections WHERE match_id=m.id;
  INSERT INTO private.delayed_corrections(id,child_id,match_id,actor,reason,fingerprint,before_child,restored_child,before_parent,original_outcome,original_settlement,reversal_ids,financial_game_id,transaction_id,executor_role,created_at,generation)
  VALUES(p_request,c.id,m.id,who,'Admin board undo',jsonb_build_object('boardUndo',true,'turn',s->'turn'),r,restored,to_jsonb(m),coalesce(to_jsonb(o),'{}'),coalesce(to_jsonb(sett),'{}'),reversals,gen_random_uuid(),txid_current(),session_user,at_i,generation_i);
  c:=jsonb_populate_record(NULL::private.delayed_children,restored);
  UPDATE private.delayed_children SET state=c.state,revision=c.revision,actor=c.actor,segment=c.segment,terminal=false,
   available_at=c.available_at,last_call_at=c.last_call_at,expires_at=c.expires_at,started_at=c.started_at,gameplay_due_at=c.gameplay_due_at WHERE id=p_id;
  UPDATE private.delayed_matches SET status='active',settled_at=NULL,revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 ELSE
  IF result_i.id IS NOT NULL THEN
   -- Retain a clearly marked, zero-net historical result; its exact original is
   -- in the immutable audit. The terminal key is free for the next completion.
   UPDATE public.game_results SET settlement_key=settlement_key||':undone:'||p_request,
    winner_player_id=NULL,winner_username='Undone by admin',winning_hand_description='Admin undo '||p_request,
    pot_won=0,player_chip_changes='{}',is_chopped=true WHERE id=result_i.id;
  END IF;
  UPDATE public.rounds SET status=oldr.status,decision_deadline=CASE WHEN remaining_i IS NOT NULL THEN to_timestamp((at_ms+remaining_i)/1000.0) END,current_turn_position=oldr.current_turn_position WHERE id=oldr.id;
  IF p_game='chess' THEN UPDATE private.chess_matches SET state=s,revision=p_revision+1,settlement=NULL,finished=false,paused_at=(restored->>'paused_at')::bigint WHERE dealer_game_id=p_id;
  ELSE UPDATE private.ptown_words_matches SET state=s,revision=p_revision+1,settlement=NULL,finished=false,paused_at=(restored->>'paused_at')::bigint WHERE dealer_game_id=p_id;END IF;
  UPDATE public.session_player_snapshots ss SET chips=p.chips,created_at=at_i FROM public.players p WHERE ss.dealer_game_id=p_id AND ss.player_id=p.id;
 END IF;
 RETURN jsonb_build_object('outcome','undone','sessionId',f.session_id,'revision',p_revision+1,'reversalIds',reversals);
END $$;
REVOKE ALL ON FUNCTION public.admin_board_undo(uuid,text,text,uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_board_undo(uuid,text,text,uuid,bigint) TO authenticated;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'board_undo_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
