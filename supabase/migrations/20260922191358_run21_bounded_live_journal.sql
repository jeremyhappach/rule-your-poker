-- Run21-only live snapshot/journal split. Legacy full-history interfaces remain compatible.
-- Reconcile this generated version with Farkle's final migration head before release.
LOCK TABLE private.run21_matches IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE private.run21_matches ADD COLUMN event_sequence bigint NOT NULL DEFAULT 0;
CREATE TABLE private.run21_events (
 dealer_game_id uuid NOT NULL REFERENCES private.run21_matches(dealer_game_id) ON DELETE CASCADE,
 sequence bigint NOT NULL CHECK(sequence>0), event jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,sequence), CHECK((event->>'sequence')::bigint=sequence)
);
ALTER TABLE private.run21_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_events FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.run21_events(dealer_game_id,sequence,event)
 SELECT m.dealer_game_id,(e->>'sequence')::bigint,e FROM private.run21_matches m
 CROSS JOIN LATERAL jsonb_array_elements(m.state->'events') e;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.run21_events GROUP BY dealer_game_id HAVING min(sequence)<>1 OR max(sequence)<>count(*)) THEN
  RAISE EXCEPTION 'run21:journal_gap';
 END IF;
END $$;
UPDATE private.run21_matches m SET
 event_sequence=coalesce((SELECT max(sequence) FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id),0),
 state=CASE WHEN state IS NULL THEN NULL ELSE (state-'events')||jsonb_build_object('events','[]'::jsonb,'eventSequence',
 coalesce((SELECT max(sequence) FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id),0)) END;

CREATE FUNCTION private.run21_append_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e jsonb; n bigint; cursor bigint:=OLD.event_sequence; recorded jsonb;
BEGIN
 IF NEW.state IS NULL THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.state->'events') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'run21:journal_required'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(NEW.state->'events') LOOP
  n:=(e->>'sequence')::bigint;
  IF n<=OLD.event_sequence THEN
   SELECT event INTO recorded FROM private.run21_events WHERE dealer_game_id=OLD.dealer_game_id AND sequence=n;
   IF recorded IS DISTINCT FROM e THEN RAISE EXCEPTION 'run21:journal_rewrite'; END IF;
  ELSE
   IF n IS DISTINCT FROM cursor+1 THEN RAISE EXCEPTION 'run21:journal_gap'; END IF;
   INSERT INTO private.run21_events(dealer_game_id,sequence,event) VALUES(OLD.dealer_game_id,n,e);
   cursor:=n;
  END IF;
 END LOOP;
 IF NEW.state ? 'eventSequence' AND (NEW.state->>'eventSequence')::bigint IS DISTINCT FROM cursor THEN
  RAISE EXCEPTION 'run21:journal_cursor';
 END IF;
 NEW.event_sequence:=cursor;
 NEW.state:=(NEW.state-'events')||jsonb_build_object('events','[]'::jsonb,'eventSequence',cursor);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_append_events() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_append_events BEFORE UPDATE OF state ON private.run21_matches
 FOR EACH ROW EXECUTE FUNCTION private.run21_append_events();

CREATE FUNCTION public.run21_server_load_current(p_game_id uuid DEFAULT NULL,p_after_sequence bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.run21_require_local();
 RETURN coalesce((SELECT jsonb_agg(CASE WHEN p_after_sequence IS NULL OR m.state IS NULL THEN to_jsonb(m) ELSE
 jsonb_set(to_jsonb(m),'{state,events}',coalesce((SELECT jsonb_agg(e.event ORDER BY e.sequence)
 FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id AND e.sequence>p_after_sequence),'[]'::jsonb)) END
 ORDER BY m.created_at) FROM private.run21_matches m
 JOIN public.games g ON g.id=m.game_id WHERE g.real_money=false AND (p_game_id IS NULL OR m.game_id=p_game_id)
 AND (p_game_id IS NOT NULL OR NOT m.finished)),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.run21_server_load_current(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_server_load_current(uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.run21_server_load(p_game_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.run21_require_local();
 RETURN coalesce((SELECT jsonb_agg(CASE WHEN m.state IS NULL THEN to_jsonb(m) ELSE
 jsonb_set(to_jsonb(m),'{state,events}',coalesce((SELECT jsonb_agg(e.event ORDER BY e.sequence)
 FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id),'[]'::jsonb)) #- '{state,eventSequence}' END ORDER BY m.created_at)
 FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
 WHERE g.real_money=false AND (p_game_id IS NULL OR m.game_id=p_game_id)
 AND (p_game_id IS NOT NULL OR NOT m.finished)),'[]'::jsonb);
END $$;

-- Called only with the server credential. The handler separately verifies the bearer
-- token and checks its verified UUID equals p_user_id before using this result.
CREATE FUNCTION public.run21_server_admit(p_user_id uuid,p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE allowed boolean; record jsonb; started timestamptz:=clock_timestamp(); gate_ms numeric; member_ms numeric;
BEGIN
 allowed:=private.run21_actor_allowed(p_user_id);
 gate_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
 IF NOT coalesce(allowed,false) THEN RETURN jsonb_build_object('allowed',false); END IF;
 started:=clock_timestamp();
 SELECT to_jsonb(m)||jsonb_build_object('dealer_user_id',d.dealer_user_id) INTO record
 FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
 JOIN public.dealer_games d ON d.id=m.dealer_game_id
 WHERE m.game_id=p_game_id AND g.real_money=false
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'userId'=p_user_id::text AND p->>'kind'='human')
 ORDER BY m.created_at DESC LIMIT 1;
 member_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
 RETURN jsonb_build_object('allowed',true,'record',record,'gateMs',gate_ms,'membershipMs',member_ms);
END $$;
REVOKE ALL ON FUNCTION public.run21_server_admit(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_server_admit(uuid,uuid) TO service_role;

-- Preserve existing locking, identity, CAS and settlement; return only supplied events.
CREATE OR REPLACE FUNCTION public.run21_server_commit(p_dealer_game_id uuid,p_expected_revision bigint,p_state jsonb,p_bot_due_at bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m private.run21_matches; g public.games; last_round jsonb; receipt jsonb; winner uuid; loser uuid;
BEGIN
  PERFORM private.run21_require_local();
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  IF g.real_money IS DISTINCT FROM false OR g.game_type IS DISTINCT FROM 'run21' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR m.finished THEN
    RAISE EXCEPTION 'run21:inactive_identity'; END IF;
  IF m.revision<>p_expected_revision THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision); END IF;
  IF p_state#>>'{identity,sessionId}' IS DISTINCT FROM m.game_id::text OR p_state#>>'{identity,dealerGameId}' IS DISTINCT FROM m.dealer_game_id::text
    OR p_state#>>'{identity,handNumber}' IS DISTINCT FROM '1' OR p_state->>'stake' IS DISTINCT FROM m.stake::text
    OR jsonb_array_length(p_state->'players')<>2 OR jsonb_array_length(p_state->'rounds')<1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_state->'players') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p->>'id'))
    OR (m.state IS NOT NULL AND (p_state->'config' IS DISTINCT FROM m.state->'config' OR (p_state->>'updatedAt')::bigint<(m.state->>'updatedAt')::bigint)) THEN
    RAISE EXCEPTION 'run21:commit_identity'; END IF;
  last_round:=p_state->'rounds'->-1;
  IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=(last_round->>'id')::uuid) THEN
    INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
      VALUES((last_round->>'id')::uuid,g.id,m.dealer_game_id,1,(last_round->>'number')::integer,0,'betting',0);
  END IF;
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=m.dealer_game_id
    AND id IN(SELECT (r->>'id')::uuid FROM jsonb_array_elements(p_state->'rounds') r WHERE (r->>'revealed')::boolean) AND status<>'completed';
  UPDATE public.games SET current_round=(last_round->>'number')::integer WHERE id=g.id AND current_round IS DISTINCT FROM (last_round->>'number')::integer;
  receipt:=nullif(p_state->'settlement','null'::jsonb);
  IF receipt IS NOT NULL THEN
    winner:=(receipt->>'winnerId')::uuid;loser:=(receipt->>'loserId')::uuid;
    IF receipt->>'key' IS DISTINCT FROM 'run21:'||m.dealer_game_id||':1' OR receipt->>'winnerId' IS DISTINCT FROM p_state->>'winnerId'
      OR receipt->>'amount' IS DISTINCT FROM m.stake::text OR winner=loser OR m.initial_balances->>winner::text IS NULL OR m.initial_balances->>loser::text IS NULL
      OR (last_round->>'number')::integer<3 OR NOT(last_round->>'revealed')::boolean
      OR (p_state#>>ARRAY['cumulative',winner::text])::bigint<=(p_state#>>ARRAY['cumulative',loser::text])::bigint THEN
      RAISE EXCEPTION 'run21:settlement_identity'; END IF;
    INSERT INTO private.run21_settlements(id,transfer_batch_id,dealer_game_id,settlement_key,winner_id,loser_id,amount)
      VALUES((receipt->>'resultId')::uuid,(receipt->>'transferBatchId')::uuid,m.dealer_game_id,receipt->>'key',winner,loser,m.stake)
      ON CONFLICT(dealer_game_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id AND id=(receipt->>'resultId')::uuid AND transfer_batch_id=(receipt->>'transferBatchId')::uuid AND winner_id=winner AND loser_id=loser AND amount=m.stake) THEN
      RAISE EXCEPTION 'run21:settlement_conflict'; END IF;
    m.balances:=jsonb_set(jsonb_set(m.initial_balances,ARRAY[winner::text],to_jsonb((m.initial_balances->>winner::text)::numeric+m.stake)),ARRAY[loser::text],to_jsonb((m.initial_balances->>loser::text)::numeric-m.stake));
  ELSIF m.state->'settlement' IS NOT NULL AND m.state->'settlement'<>'null'::jsonb THEN
    RAISE EXCEPTION 'run21:settlement_cannot_regress';
  END IF;
  UPDATE private.run21_matches SET state=p_state,revision=revision+1,bot_due_at=p_bot_due_at,balances=m.balances
    WHERE dealer_game_id=m.dealer_game_id RETURNING * INTO m;
  RETURN jsonb_build_object('outcome','committed','record',CASE WHEN p_state ? 'eventSequence' THEN
    jsonb_set(to_jsonb(m),'{state,events}',p_state->'events') ELSE
    jsonb_set(to_jsonb(m),'{state,events}',p_state->'events') #- '{state,eventSequence}' END);
END $$;
