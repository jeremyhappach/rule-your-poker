CREATE OR REPLACE FUNCTION private.five_alive_allocate(p_mode text, p_owner uuid, p_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE pool private.five_alive_pool; n integer; chosen text[]:=ARRAY[]::text[]; picked text; result jsonb; existing integer;
BEGIN
 IF p_mode NOT IN ('arcade','async') OR p_mode IS NULL OR p_owner IS NULL OR p_version IS NULL THEN
  RAISE EXCEPTION 'five_alive:invalid_allocation';
 END IF;
 -- The global pool lock is also the replay/concurrency lock for every owner.
 SELECT * INTO STRICT pool FROM private.five_alive_pool WHERE version=p_version FOR UPDATE;
 SELECT count(*) INTO existing FROM private.five_alive_allocations WHERE mode=p_mode AND owner_id=p_owner;
 IF existing NOT IN (0,3) OR EXISTS(SELECT FROM private.five_alive_allocations WHERE mode=p_mode AND owner_id=p_owner AND version<>p_version) THEN
  RAISE EXCEPTION 'five_alive:allocation_conflict';
 END IF;
 IF existing=0 THEN
  SELECT count(*) INTO n FROM private.five_alive_answers WHERE version=p_version;
  IF n<3 THEN RAISE EXCEPTION 'five_alive:pool_too_small'; END IF;
  FOR r IN 1..3 LOOP
   IF pool.epoch=0 OR pool.cursor>=n THEN
    pool.epoch:=pool.epoch+1;pool.cursor:=0;
    -- pg_catalog.gen_random_uuid uses cryptographically strong randomness.
    -- Move words already selected for this game (and the last prior word) to
    -- the end on rollover, preventing cross-boundary duplicate game answers.
    INSERT INTO private.five_alive_shuffle(version,epoch,position,word)
    SELECT p_version,pool.epoch,row_number() OVER (ORDER BY (a.word=ANY(chosen) OR a.word=pool.last_word) NULLS FIRST,gen_random_uuid())::integer,a.word
    FROM private.five_alive_answers a WHERE a.version=p_version;
   END IF;
   pool.cursor:=pool.cursor+1;
   SELECT word INTO STRICT picked FROM private.five_alive_shuffle
    WHERE version=p_version AND epoch=pool.epoch AND position=pool.cursor;
   IF picked=ANY(chosen) THEN RAISE EXCEPTION 'five_alive:duplicate_answer'; END IF;
   chosen:=array_append(chosen,picked);pool.last_word:=picked;
   INSERT INTO private.five_alive_allocations(mode,owner_id,version,round,word)
    VALUES(p_mode,p_owner,p_version,r,picked);
  END LOOP;
  UPDATE private.five_alive_pool SET epoch=pool.epoch,cursor=pool.cursor,last_word=pool.last_word WHERE version=p_version;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('word',a.word,'difficulty',w.difficulty) ORDER BY a.round) INTO result
 FROM private.five_alive_allocations a JOIN private.five_alive_answers w USING(version,word)
 WHERE a.mode=p_mode AND a.owner_id=p_owner;
 RETURN result;
END $function$
