-- Unapplied. Preserve the deployed dispatcher, including Race Poker and replay guards.
DO $$
DECLARE source text:=pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure);
 anchor text:='    WHEN v_game.game_type=''farkle'' THEN';
BEGIN
 IF md5(replace(source,chr(13),'')) <> '7b6ca8feaa35c1fcce8b00491783e9d4' THEN
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
-- Terminal membership is frozen: standing up must not hide the final notification.
-- This exposes only a revision signal, never the private match or other users' hands.
CREATE FUNCTION public.canasta_revision_visible(p_match uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.canasta_matches m JOIN public.profiles pr ON pr.id=auth.uid() AND pr.is_active
  WHERE m.dealer_game_id=p_match AND (
   EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=pr.id AND NOT p.is_bot AND p.status<>'left')
   OR (m.settlement IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) seat WHERE seat->>'userId'=pr.id::text))))
$$;
REVOKE ALL ON FUNCTION public.canasta_revision_visible(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.canasta_revision_visible(uuid) TO authenticated;
CREATE POLICY canasta_member_revision ON public.canasta_revisions FOR SELECT TO authenticated
 USING(public.canasta_revision_visible(dealer_game_id));
CREATE FUNCTION private.canasta_publish_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.canasta_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER canasta_publish_revision AFTER INSERT OR UPDATE OF revision ON private.canasta_matches FOR EACH ROW EXECUTE FUNCTION private.canasta_publish_revision();
REVOKE ALL ON FUNCTION private.canasta_publish_revision() FROM PUBLIC,anon,authenticated,service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.canasta_revisions;

-- Canonical Defaults owns the editable suggested stake. Match timing stays frozen
-- in private.canasta_rules(); preserve any existing administrator choice.
INSERT INTO public.game_defaults(game_type,ante_amount) VALUES('canasta',5)
 ON CONFLICT(game_type) DO NOTHING;

CREATE FUNCTION public.canasta_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',1,'user_id',auth.uid(),'session_id',p_session_id,'enabled',
  private.canasta_actor_allowed(auth.uid()) AND EXISTS(SELECT 1 FROM private.canasta_release WHERE admission_enabled)
  AND (p_session_id IS NULL OR EXISTS(SELECT 1 FROM public.players p JOIN public.games g ON g.id=p.game_id
   WHERE p.game_id=p_session_id AND p.user_id=auth.uid() AND NOT p.is_bot AND p.status='active' AND g.real_money=false)))
$$;
REVOKE ALL ON FUNCTION public.canasta_capabilities(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.canasta_capabilities(uuid) TO authenticated;
