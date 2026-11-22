-- Temporary owner-requested Async smoke harness. No client switch or URL flag.
-- Disabled by updating the singleton; existing allocation receipts stay frozen.
CREATE TABLE IF NOT EXISTS private.five_alive_apple_harness (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS private.five_alive_apple_allocations (
 owner_id uuid PRIMARY KEY,
 version text NOT NULL REFERENCES private.five_alive_pool(version),
 answers jsonb NOT NULL CHECK(jsonb_array_length(answers)=3),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.five_alive_apple_harness ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.five_alive_apple_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.five_alive_apple_harness,private.five_alive_apple_allocations FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.five_alive_apple_harness(singleton,enabled) VALUES(true,true)
 ON CONFLICT(singleton) DO NOTHING;

DO $patch$
DECLARE definition text; needle text := E' IF existing=0 THEN\n  -- Relative difficulty snapshots';
BEGIN
 definition:=pg_get_functiondef('private.five_alive_allocate(text,uuid,text)'::regprocedure);
 IF strpos(definition,'-- Temporary APPLE Async harness')=0 THEN
  IF md5(definition)<>'e87e877680c4c20e2de9a33bf22984b0' OR strpos(definition,needle)=0 THEN
   RAISE EXCEPTION 'five_alive:apple_allocator_preimage_changed';
  END IF;
  definition:=replace(definition,needle,$hook$
 -- Temporary APPLE Async harness: the existing pool lock serializes allocation.
 -- Never replace a normal allocation, consume the normal pool, or change Arcade.
 IF p_mode='async' AND existing=0 THEN
  IF EXISTS(SELECT FROM private.five_alive_apple_allocations WHERE owner_id=p_owner AND version<>p_version) THEN
   RAISE EXCEPTION 'five_alive:allocation_conflict';
  END IF;
  SELECT answers INTO result FROM private.five_alive_apple_allocations WHERE owner_id=p_owner;
  IF FOUND THEN RETURN result; END IF;
  IF EXISTS(SELECT FROM private.five_alive_apple_harness WHERE singleton AND enabled) THEN
   SELECT coalesce((d.tiers->>'APPLE')::smallint,a.difficulty) INTO STRICT tier_i
   FROM private.five_alive_answers a
   LEFT JOIN private.five_alive_difficulty_current c ON c.pool_version=a.version
   LEFT JOIN private.five_alive_difficulty_versions d ON d.version=c.difficulty_version AND d.pool_version=c.pool_version
   WHERE a.version=p_version AND a.word='APPLE';
   IF tier_i IS NULL OR tier_i NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'five_alive:missing_difficulty'; END IF;
   SELECT jsonb_agg(jsonb_build_object('word','APPLE','difficulty',tier_i)) INTO result FROM generate_series(1,3);
   INSERT INTO private.five_alive_apple_allocations(owner_id,version,answers) VALUES(p_owner,p_version,result);
   RETURN result;
  END IF;
 END IF;
 IF existing=0 THEN
  -- Relative difficulty snapshots$hook$);
  EXECUTE definition;
 END IF;
END $patch$;
REVOKE ALL ON FUNCTION private.five_alive_allocate(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
