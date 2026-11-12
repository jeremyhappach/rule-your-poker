-- Run in the same transaction as candidate.sql. Assigned and historical games
-- are excluded. The revision change admits the new presentation metadata through
-- existing equal-revision snapshot guards and realtime publication.
UPDATE private.ptown_words_matches SET revision=revision+1
 WHERE nullif(state->>'backgroundId','') IS NULL
 AND state->>'phase'='playing' AND NOT finished AND settlement IS NULL;
DO $$
DECLARE parent uuid; changed integer;
BEGIN
 -- Match the existing action lock order (parent, then child). The parent revision
 -- invokes the existing per-recipient realtime publisher, including idle viewers.
 FOR parent IN SELECT m.id FROM private.delayed_matches m WHERE m.status='active'
 AND EXISTS(SELECT 1 FROM private.delayed_children c WHERE c.match_id=m.id
  AND c.game_type='ptown-words' AND NOT c.terminal AND c.state->>'phase'='playing'
  AND nullif(c.state->>'backgroundId','') IS NULL) ORDER BY m.id FOR UPDATE OF m LOOP
  UPDATE private.delayed_children SET state=state,revision=revision+1
   WHERE match_id=parent AND game_type='ptown-words' AND NOT terminal
   AND state->>'phase'='playing' AND nullif(state->>'backgroundId','') IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed>0 THEN UPDATE private.delayed_matches SET revision=revision+1 WHERE id=parent; END IF;
 END LOOP;
END $$;
