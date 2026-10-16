-- Apply only after the complete isolated qualification passes. Admission stays closed.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE private.run21_matches IN ACCESS EXCLUSIVE MODE NOWAIT;
CREATE TEMP TABLE run21_deck_preservation ON COMMIT DROP AS SELECT
 (SELECT md5(coalesce(string_agg(md5((to_jsonb(m)-'deck_version')::text),'' ORDER BY dealer_game_id),'')) FROM private.run21_matches m) matches,
 (SELECT md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' ORDER BY dealer_game_id,sequence),'')) FROM private.run21_events e) events,
 (SELECT md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY dealer_game_id),'')) FROM private.run21_settlements s) settlements,
 (SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND n.nspname IN ('public','private') AND p.proname<>'run21_preserve_decks') routines;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.run21_production_release WHERE qualified) THEN RAISE EXCEPTION 'run21:close_admission_before_deck_migration'; END IF;
 IF md5(pg_get_functiondef('public.run21_server_commit(uuid,bigint,jsonb,bigint)'::regprocedure))<>'ba04872109c092c278f2d620acd361b8'
 OR md5(pg_get_functiondef('private.run21_require_local()'::regprocedure))<>'4b06e326bb4a2217cd066067241eea88' THEN
  RAISE EXCEPTION 'run21:qualified_authority_changed';
 END IF;
END $$;
-- Existing rows keep version one, including any admitted but uninitialized match.
ALTER TABLE private.run21_matches ADD COLUMN IF NOT EXISTS deck_version smallint NOT NULL DEFAULT 1 CHECK (deck_version IN (1,2));
ALTER TABLE private.run21_matches ALTER COLUMN deck_version SET DEFAULT 2;

CREATE OR REPLACE FUNCTION private.run21_preserve_decks() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; previous jsonb; p jsonb; evidence jsonb; position integer;
BEGIN
 IF TG_OP='UPDATE' AND NEW.deck_version IS DISTINCT FROM OLD.deck_version THEN
  RAISE EXCEPTION 'run21:deck_version_immutable';
 END IF;
 IF NEW.state IS NULL THEN
  IF TG_OP='UPDATE' AND OLD.state IS NOT NULL THEN RAISE EXCEPTION 'run21:decks_cannot_reset'; END IF;
  RETURN NEW;
 END IF;
 IF coalesce((NEW.state->>'dealingVersion')::integer,1)<>NEW.deck_version THEN RAISE EXCEPTION 'run21:deck_version_conflict'; END IF;
 IF TG_OP='UPDATE' AND OLD.state IS NOT NULL THEN
  IF jsonb_array_length(NEW.state->'rounds')<jsonb_array_length(OLD.state->'rounds') THEN RAISE EXCEPTION 'run21:rounds_cannot_regress'; END IF;
  FOR previous,position IN SELECT value,ordinality::integer FROM jsonb_array_elements(OLD.state->'rounds') WITH ORDINALITY LOOP
   r:=NEW.state->'rounds'->(position-1);
   IF r->'id' IS DISTINCT FROM previous->'id' OR r->'secret' IS DISTINCT FROM previous->'secret' THEN
    RAISE EXCEPTION 'run21:deck_evidence_immutable';
   END IF;
  END LOOP;
 END IF;
 -- Existing historical evidence and commitments are never transformed.
 IF NEW.deck_version=1 THEN RETURN NEW; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(NEW.state->'rounds') LOOP
  IF r#>>'{secret,version}' IS DISTINCT FROM '2' OR r->'secret' ? 'cards'
   OR jsonb_typeof(r#>'{secret,decks}') IS DISTINCT FROM 'object'
   OR (SELECT count(*) FROM jsonb_object_keys(r#>'{secret,decks}'))<>2 THEN
   RAISE EXCEPTION 'run21:independent_decks_required';
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(NEW.participants) LOOP
   evidence:=r#>ARRAY['secret','decks',p->>'id'];
   IF evidence IS NULL OR evidence->>'playerId' IS DISTINCT FROM p->>'id' OR evidence->'roundId' IS DISTINCT FROM r->'id'
    OR evidence->'identity' IS DISTINCT FROM NEW.state->'identity'
    OR jsonb_typeof(evidence->'cards') IS DISTINCT FROM 'array'
    OR jsonb_array_length(evidence->'cards')<>52
    OR (SELECT count(DISTINCT (card->>'rank',card->>'suit')) FROM jsonb_array_elements(evidence->'cards') card)<>52
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(evidence->'cards') card
      WHERE coalesce(card->>'rank','') NOT IN ('A','2','3','4','5','6','7','8','9','10','J','Q','K')
       OR coalesce(card->>'suit','') NOT IN ('hearts','diamonds','clubs','spades'))
    OR coalesce(evidence->>'salt','') !~ '^[0-9a-f]{64}$' OR coalesce(evidence->>'commitment','') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'run21:invalid_player_deck';
   END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_preserve_decks() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS run21_preserve_decks ON private.run21_matches;
CREATE TRIGGER run21_preserve_decks BEFORE INSERT OR UPDATE OF state,deck_version ON private.run21_matches
 FOR EACH ROW EXECUTE FUNCTION private.run21_preserve_decks();
DO $$ DECLARE before_row record; fn record;
BEGIN
 SELECT * INTO STRICT before_row FROM run21_deck_preservation;
 IF before_row.matches IS DISTINCT FROM (SELECT md5(coalesce(string_agg(md5((to_jsonb(m)-'deck_version')::text),'' ORDER BY dealer_game_id),'')) FROM private.run21_matches m)
 OR before_row.events IS DISTINCT FROM (SELECT md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' ORDER BY dealer_game_id,sequence),'')) FROM private.run21_events e)
 OR before_row.settlements IS DISTINCT FROM (SELECT md5(coalesce(string_agg(md5(to_jsonb(s)::text),'' ORDER BY dealer_game_id),'')) FROM private.run21_settlements s) THEN
  RAISE EXCEPTION 'run21:historical_evidence_changed';
 END IF;
 FOR fn IN SELECT key,value FROM jsonb_each_text(before_row.routines) LOOP
  IF md5(pg_get_functiondef(fn.key::regprocedure))<>fn.value THEN RAISE EXCEPTION 'run21:unrelated_routine_changed:%',fn.key; END IF;
 END LOOP;
END $$;
