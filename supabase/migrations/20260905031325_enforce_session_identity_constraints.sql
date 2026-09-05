-- Validate exact session ownership without rewriting legacy financial evidence.
CREATE UNIQUE INDEX IF NOT EXISTS dealer_games_id_session_key ON public.dealer_games(id, session_id);

ALTER TABLE public.games ADD CONSTRAINT games_current_dealer_session_fkey
 FOREIGN KEY (current_game_uuid,id) REFERENCES public.dealer_games(id,session_id)
 DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE public.games VALIDATE CONSTRAINT games_current_dealer_session_fkey;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_dealer_session_fkey
 FOREIGN KEY (dealer_game_id,game_id) REFERENCES public.dealer_games(id,session_id)
 DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE public.rounds VALIDATE CONSTRAINT rounds_dealer_session_fkey;
ALTER TABLE public.session_player_snapshots ADD CONSTRAINT snapshots_dealer_session_fkey
 FOREIGN KEY (dealer_game_id,game_id) REFERENCES public.dealer_games(id,session_id)
 ON DELETE SET NULL (dealer_game_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE public.session_player_snapshots VALIDATE CONSTRAINT snapshots_dealer_session_fkey;

-- Historical snapshots may outlive players. Check new provenance instead of
-- retroactively binding/deleting the 93 historical orphan snapshots.
CREATE OR REPLACE FUNCTION private.guard_snapshot_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
 IF TG_OP='INSERT' OR NEW.game_id IS DISTINCT FROM OLD.game_id
    OR NEW.player_id IS DISTINCT FROM OLD.player_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
  IF NOT EXISTS (SELECT 1 FROM public.players p
     WHERE p.id=NEW.player_id AND p.game_id=NEW.game_id AND p.user_id=NEW.user_id) THEN
   RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='snapshot_participant_identity_mismatch';
  END IF;
  IF NEW.dealer_game_id IS NULL AND EXISTS (
     SELECT 1 FROM public.games g WHERE g.id=NEW.game_id AND g.current_game_uuid IS NOT NULL) THEN
   RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='snapshot_dealer_identity_required';
  END IF;
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION private.guard_snapshot_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER snapshot_identity_guard BEFORE INSERT OR UPDATE OF game_id,player_id,user_id
 ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION private.guard_snapshot_identity();
COMMENT ON CONSTRAINT snapshots_dealer_session_fkey ON public.session_player_snapshots IS
'Non-null dealer identities must belong to this session. Legacy null identities remain unaltered; they are not inferred or deduplicated.';
