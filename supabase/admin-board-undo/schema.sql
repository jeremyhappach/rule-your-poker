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
