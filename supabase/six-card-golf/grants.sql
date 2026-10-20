DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('private','public') AND p.proname LIKE 'golf_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.golf_capabilities(uuid),public.golf_snapshot(uuid),public.golf_history(uuid),
 public.golf_action(uuid,uuid,uuid,bigint,text,integer[]),public.golf_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.golf_close(uuid) TO authenticated;
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.golf_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.golf_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER golf_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type='six-card-golf') EXECUTE FUNCTION private.golf_pause();
CREATE TRIGGER golf_publish AFTER INSERT OR UPDATE ON private.golf_matches FOR EACH ROW EXECUTE FUNCTION private.golf_publish();
-- Defaults do not activate discovery or match admission.
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
VALUES('six-card-golf','table',5,false,'none','auto_fold',true,false,false,0,0) ON CONFLICT(game_type) DO NOTHING;
