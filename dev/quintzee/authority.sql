-- LOCAL QUALIFICATION ADAPTER ONLY. Not a substitute for canonical session settlement.
CREATE SCHEMA IF NOT EXISTS quintzee_qualification;
REVOKE ALL ON SCHEMA quintzee_qualification FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS quintzee_qualification.runs(
 id uuid PRIMARY KEY, state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0,
 theme text NOT NULL CHECK(theme IN('classic','modern')), paused_at bigint,
 config jsonb NOT NULL, dependency_hash text NOT NULL
);
ALTER TABLE quintzee_qualification.runs ADD COLUMN IF NOT EXISTS abandoned_at bigint;
ALTER TABLE quintzee_qualification.runs ADD COLUMN IF NOT EXISTS player_names jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS quintzee_qualification.receipts(
 run_id uuid NOT NULL REFERENCES quintzee_qualification.runs(id), request_id uuid NOT NULL,
 actor uuid NOT NULL, fingerprint text NOT NULL, PRIMARY KEY(run_id,request_id)
);
CREATE OR REPLACE FUNCTION quintzee_qualification.command(run_id uuid,actor uuid,request_id uuid DEFAULT NULL,
 revision bigint DEFAULT NULL,scope text DEFAULT NULL,action text DEFAULT NULL,items integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r quintzee_qualification.runs; receipt quintzee_qualification.receipts; now_ms bigint;
 before_s jsonb; fingerprint text; outcome text:='current'; current_scope text;
BEGIN
 SELECT * INTO STRICT r FROM quintzee_qualification.runs WHERE id=run_id FOR UPDATE;
 IF actor IS NULL OR NOT (r.state->'players') ? actor::text THEN RAISE EXCEPTION 'quintzee:participant_required'; END IF;
 IF r.config IS DISTINCT FROM r.state->'rules' OR r.dependency_hash IS DISTINCT FROM md5(pg_get_functiondef('private.yahtzee_category_score(jsonb,jsonb,text)'::regprocedure))
 THEN RAISE EXCEPTION 'quintzee:frozen_dependency_changed'; END IF;
 now_ms:=floor(extract(epoch FROM clock_timestamp())*1000);before_s:=r.state;
 IF action IS NOT NULL THEN
  IF request_id IS NULL OR revision IS NULL OR scope IS NULL OR action NOT IN('roll','score','abandon') THEN RAISE EXCEPTION 'quintzee:command'; END IF;
  IF action='abandon' AND jsonb_array_length(r.state->'players')<>1 THEN RAISE EXCEPTION 'quintzee:solo_only'; END IF;
  fingerprint:=jsonb_build_array(actor,revision,scope,action,items)::text;
  SELECT * INTO receipt FROM quintzee_qualification.receipts t WHERE t.run_id=command.run_id AND t.request_id=command.request_id;
  IF FOUND THEN
   IF receipt.actor<>actor OR receipt.fingerprint<>fingerprint THEN RAISE EXCEPTION 'quintzee:request_conflict'; END IF;
   outcome:='duplicate';
  END IF;
 END IF;
 IF r.paused_at IS NULL AND r.abandoned_at IS NULL THEN r.state:=private.quintzee_advance(r.state,now_ms); END IF;
 IF r.state IS DISTINCT FROM before_s THEN r.revision:=r.revision+1; END IF;
 current_scope:=run_id::text||':'||(r.state->>'round')||':'||(r.state->>'turnIndex');
 IF action IS NOT NULL AND outcome<>'duplicate' THEN
  IF r.revision<>revision OR scope<>current_scope OR (r.state->>'finished')::boolean OR r.paused_at IS NOT NULL OR r.abandoned_at IS NOT NULL THEN outcome:='stale';
  ELSIF r.state->'players'->>((r.state->>'turnIndex')::integer)<>actor::text THEN RAISE EXCEPTION 'quintzee:not_your_turn';
  ELSIF action='abandon' THEN r.abandoned_at:=now_ms;r.revision:=r.revision+1;outcome:='committed';
  ELSE r.state:=private.quintzee_reduce(r.state,action,items,now_ms);r.revision:=r.revision+1;outcome:='committed'; END IF;
  INSERT INTO quintzee_qualification.receipts VALUES(run_id,request_id,actor,fingerprint);
 END IF;
 UPDATE quintzee_qualification.runs t SET state=r.state,revision=r.revision,abandoned_at=r.abandoned_at WHERE t.id=run_id;
 RETURN jsonb_build_object('id',run_id,'state',r.state,'revision',r.revision,'scope',run_id::text||':'||(r.state->>'round')||':'||(r.state->>'turnIndex'),
 'serverAt',now_ms,'outcome',outcome,'theme',r.theme,'pausedAt',r.paused_at,'playerNames',r.player_names,
 'status',CASE WHEN r.abandoned_at IS NOT NULL THEN 'abandoned' WHEN (r.state->>'finished')::boolean THEN 'completed' ELSE 'active' END);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA quintzee_qualification FROM PUBLIC,anon,authenticated,service_role;
