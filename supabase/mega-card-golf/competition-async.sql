CREATE FUNCTION private.mega_delayed_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE attempt jsonb;person text;prior jsonb;i integer:=0;total bigint;count_i integer;low bigint;winners jsonb;
BEGIN
 IF NEW.game_type<>'mega-card-golf' OR NEW.state IS NULL THEN RETURN NEW;END IF;
 IF NEW.config IS DISTINCT FROM OLD.config OR NEW.match_id IS DISTINCT FROM OLD.match_id OR NEW.stake IS DISTINCT FROM OLD.stake THEN RAISE EXCEPTION 'mega:immutable_configuration';END IF;
 IF NEW.state->>'child' IS DISTINCT FROM NEW.id::text OR NEW.state->>'game' IS DISTINCT FROM 'mega-card-golf' OR NEW.state->'players' IS DISTINCT FROM coalesce(OLD.state->'players',jsonb_build_array(NEW.starter,CASE WHEN NEW.starter=(SELECT organizer FROM private.delayed_matches WHERE id=NEW.match_id) THEN (SELECT opponent FROM private.delayed_matches WHERE id=NEW.match_id) ELSE (SELECT organizer FROM private.delayed_matches WHERE id=NEW.match_id) END)) THEN RAISE EXCEPTION 'mega:invalid_identity';END IF;
 IF NEW.state->'board' IS NOT NULL AND NEW.state->'board'<>'null'::jsonb THEN
  SELECT value->'board' INTO prior FROM jsonb_array_elements(coalesce(OLD.state->'attempts','[]')) WHERE value->>'actor'=NEW.actor::text ORDER BY (value->>'round')::integer DESC LIMIT 1;
  PERFORM private.mega_assert_board(NEW.state->'board',NEW.config,CASE WHEN OLD.state->'board'<>'null'::jsonb THEN OLD.state->'board' ELSE prior END);
 END IF;
 FOR attempt IN SELECT value FROM jsonb_array_elements(NEW.state->'attempts') LOOP
  i:=i+1;
  IF i<=jsonb_array_length(coalesce(OLD.state->'attempts','[]')) THEN
   IF attempt IS DISTINCT FROM OLD.state->'attempts'->(i-1) THEN RAISE EXCEPTION 'mega:immutable_hole';END IF;
  ELSE
   IF attempt->>'actor' IS DISTINCT FROM OLD.actor::text OR (attempt->>'round')::integer IS DISTINCT FROM coalesce((OLD.state->>'round')::integer,1) THEN RAISE EXCEPTION 'mega:invalid_turn';END IF;
   PERFORM private.mega_assert_board(attempt->'board',NEW.config,OLD.state->'board');
   IF (attempt->>'score')::bigint IS DISTINCT FROM (attempt#>>'{board,results,-1,score}')::bigint OR attempt#>>'{board,phase}' IS DISTINCT FROM 'scoring' THEN RAISE EXCEPTION 'mega:invalid_hole_score';END IF;
  END IF;
 END LOOP;
 IF i<jsonb_array_length(coalesce(OLD.state->'attempts','[]')) OR i>jsonb_array_length(coalesce(OLD.state->'attempts','[]'))+1 THEN RAISE EXCEPTION 'mega:invalid_transition';END IF;
 FOR person IN SELECT jsonb_array_elements_text(NEW.state->'players') LOOP
  SELECT coalesce(sum((value->>'score')::bigint),0),count(*) INTO total,count_i FROM jsonb_array_elements(NEW.state->'attempts') WHERE value->>'actor'=person;
  IF (NEW.state->'totals'->>person)::bigint IS DISTINCT FROM total OR count_i>(NEW.config#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
 END LOOP;
 IF (NEW.state->>'completed')::boolean THEN
  IF i<>2*(NEW.config#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:incomplete_course';END IF;
  SELECT min(value::bigint) INTO low FROM jsonb_each_text(NEW.state->'totals');
  SELECT jsonb_agg(key) INTO winners FROM jsonb_each_text(NEW.state->'totals') WHERE value::bigint=low;
  IF NEW.state->>'winner' IS DISTINCT FROM (CASE WHEN jsonb_array_length(winners)=1 THEN winners->>0 END) THEN RAISE EXCEPTION 'mega:invalid_winner';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER mega_delayed_guard BEFORE UPDATE OF state ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.mega_delayed_guard();
REVOKE ALL ON FUNCTION private.mega_delayed_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.mega_live_recovery_claim(p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'mega:recovery_denied';END IF;
 RETURN coalesce((SELECT jsonb_agg(private.mega_live_record(m,NULL)) FROM (SELECT * FROM private.mega_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000) ORDER BY created_at LIMIT 20)m),'[]');
END $$;
REVOKE ALL ON FUNCTION public.mega_live_recovery_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mega_live_recovery_claim(uuid) TO service_role;
