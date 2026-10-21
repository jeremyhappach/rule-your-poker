-- Unapplied. Preserve the deployed dispatcher, including Race Poker and replay guards.
DO $$
DECLARE source text:=pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure);
 anchor text:='    WHEN v_game.game_type=''farkle'' THEN';
BEGIN
 IF md5(replace(source,chr(13),'')) <> 'f3582431c00322facc1daaa81c20b682' THEN
  RAISE EXCEPTION 'canasta:ante_authority_changed';
 END IF;
 IF position('''race-poker''' IN source)=0 OR (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 THEN
  RAISE EXCEPTION 'canasta:ante_anchor_changed';
 END IF;
 EXECUTE replace(source,anchor,E'    WHEN v_game.game_type=''canasta'' THEN\n      SELECT private.canasta_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;\n'||anchor);
END $$;

CREATE FUNCTION private.canasta_freeze_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.game_type='canasta' AND (NEW.config IS DISTINCT FROM OLD.config OR NEW.game_type IS DISTINCT FROM OLD.game_type
  OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.dealer_user_id IS DISTINCT FROM OLD.dealer_user_id) THEN
  RAISE EXCEPTION 'canasta:configuration_frozen';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER canasta_freeze_configuration BEFORE UPDATE ON public.dealer_games FOR EACH ROW EXECUTE FUNCTION private.canasta_freeze_configuration();
REVOKE ALL ON FUNCTION private.canasta_freeze_configuration() FROM PUBLIC,anon,authenticated,service_role;

-- Only a revision signal is public. Hands, stock, receipts and user identifiers stay private.
CREATE TABLE public.canasta_revisions(dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),game_id uuid NOT NULL REFERENCES public.games(id),revision bigint NOT NULL);
ALTER TABLE public.canasta_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canasta_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.canasta_revisions TO authenticated;
CREATE POLICY canasta_member_revision ON public.canasta_revisions FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=canasta_revisions.game_id AND p.user_id=auth.uid() AND NOT p.is_bot AND p.status<>'left'));
CREATE FUNCTION private.canasta_publish_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.canasta_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER canasta_publish_revision AFTER INSERT OR UPDATE OF revision ON private.canasta_matches FOR EACH ROW EXECUTE FUNCTION private.canasta_publish_revision();
REVOKE ALL ON FUNCTION private.canasta_publish_revision() FROM PUBLIC,anon,authenticated,service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.canasta_revisions;

CREATE FUNCTION public.canasta_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',1,'user_id',auth.uid(),'session_id',p_session_id,'enabled',
  private.canasta_actor_allowed(auth.uid()) AND EXISTS(SELECT 1 FROM private.canasta_release WHERE admission_enabled)
  AND (p_session_id IS NULL OR EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=auth.uid() AND NOT is_bot AND status='active')))
$$;
REVOKE ALL ON FUNCTION public.canasta_capabilities(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.canasta_capabilities(uuid) TO authenticated;
