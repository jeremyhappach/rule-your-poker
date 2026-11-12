-- Local candidate only. Register a migration and upload the verified photo objects
-- before any separately authorized release. No production application in this pass.
CREATE TABLE IF NOT EXISTS private.game_background_pool (
 id text PRIMARY KEY,
 active boolean NOT NULL DEFAULT true
);
ALTER TABLE private.game_background_pool ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_background_pool FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.game_background_pool(id) VALUES
 ('peoria-big-als-5ae487317165'),('peoria-pere-marquette-60412a5fefc9'),
 ('peoria-hoops-79c99a1dbe3d'),('peoria-sullys-fa5cd5b082eb'),
 ('peoria-river-autumn-1baa663f8627'),('peoria-ballpark-464bbd71482f'),
 ('peoria-bradley-arena-5b1dc169cf70'),('peoria-theater-18d28958df02'),
 ('peoria-crusens-138624087814') ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.choose_game_background() RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE chosen text;
BEGIN
 SELECT id INTO chosen FROM private.game_background_pool WHERE active ORDER BY random() LIMIT 1;
 IF chosen IS NULL THEN RAISE EXCEPTION 'game_background:empty_pool'; END IF;
 RETURN chosen;
END $$;
REVOKE ALL ON FUNCTION private.choose_game_background() FROM PUBLIC,anon,authenticated,service_role;

-- Match row locks serialize the trigger with gameplay and competing backfills.
-- Preserve the original assignment even if a reducer replaces the whole state.
CREATE OR REPLACE FUNCTION private.words_background_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE previous text; chosen text;
BEGIN
 IF TG_TABLE_NAME='delayed_children' THEN
  IF NEW.game_type<>'ptown-words' THEN RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN previous:=nullif(OLD.state->>'backgroundId',''); END IF;
 IF NEW.state IS NULL THEN
  IF previous IS NOT NULL THEN RAISE EXCEPTION 'game_background:assignment_is_immutable'; END IF;
  RETURN NEW; -- Async invitation has no playable game state until acceptance.
 END IF;
 IF previous IS NULL AND NEW.state->>'phase'<>'playing' THEN RETURN NEW; END IF;
 chosen:=coalesce(previous,private.choose_game_background());
 NEW.state:=NEW.state||jsonb_build_object('backgroundId',chosen);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.words_background_assignment() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS words_background_assignment ON private.ptown_words_matches;
CREATE TRIGGER words_background_assignment BEFORE INSERT OR UPDATE ON private.ptown_words_matches
 FOR EACH ROW EXECUTE FUNCTION private.words_background_assignment();
DROP TRIGGER IF EXISTS words_background_assignment ON private.delayed_children;
CREATE TRIGGER words_background_assignment BEFORE INSERT OR UPDATE ON private.delayed_children
 FOR EACH ROW EXECUTE FUNCTION private.words_background_assignment();
