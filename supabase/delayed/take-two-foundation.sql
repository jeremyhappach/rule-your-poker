-- Closed admission until matching client, worker and financial qualification pass.
CREATE TABLE IF NOT EXISTS private.delayed_take_two_release(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.delayed_take_two_release(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE private.delayed_take_two_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_take_two_release FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS private.delayed_take_two_deals(
 child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 round integer NOT NULL CHECK(round BETWEEN 1 AND 3),
 deck jsonb NOT NULL CHECK(jsonb_typeof(deck)='array' AND jsonb_array_length(deck)=52),
 PRIMARY KEY(child_id,round));
ALTER TABLE private.delayed_take_two_deals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_take_two_deals FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='private.delayed_take_two_deals'::regclass AND tgname='delayed_take_two_deals_immutable') THEN
  CREATE TRIGGER delayed_take_two_deals_immutable BEFORE UPDATE OR DELETE ON private.delayed_take_two_deals FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
 END IF;
END $$;
ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check;
ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two'));

-- Same-deal reviews are embargoed until the viewer finishes that exact round.
-- Terminal forfeits also unlock saved history, since no more play is possible.
CREATE OR REPLACE FUNCTION private.delayed_take_two_review_allowed(e private.delayed_review_events,who uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.game_type<>'take-two' OR c.terminal OR e.kind='child' OR e.actor=who OR EXISTS(
  SELECT FROM private.delayed_review_events own WHERE own.child_id=e.child_id AND own.actor=who AND own.kind='attempt' AND own.round=e.round)
 FROM private.delayed_children c WHERE c.id=e.child_id
$$;
REVOKE ALL ON FUNCTION private.delayed_take_two_review_allowed(private.delayed_review_events,uuid) FROM PUBLIC,anon,authenticated,service_role;
