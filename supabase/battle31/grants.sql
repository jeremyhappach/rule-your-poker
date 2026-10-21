-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'battle31_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.battle31_capabilities(uuid),public.battle31_snapshot(uuid),public.battle31_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.battle31_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds,public.players IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.battle31_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.battle31_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER battle31_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='battle-31') EXECUTE FUNCTION private.battle31_pause();

CREATE TRIGGER battle31_publish AFTER INSERT OR UPDATE ON private.battle31_matches FOR EACH ROW EXECUTE FUNCTION private.battle31_publish();

GRANT EXECUTE ON FUNCTION public.battle31_action(uuid,uuid,bigint,text,integer[]) TO authenticated;

CREATE TRIGGER battle31_control_changed AFTER UPDATE OF auto_fold,sit_out_next_hand,intent_version ON public.players FOR EACH ROW EXECUTE FUNCTION private.battle31_control_changed();
