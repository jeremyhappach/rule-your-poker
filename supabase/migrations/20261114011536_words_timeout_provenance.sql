-- Local candidate only. Preserve the existing pass action/rules and append
-- server-recorded provenance to new timeout moves. No historical backfill.
DO $migration$
DECLARE source text; changed text;
BEGIN
 source:=pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure);
 IF position('was_timeout boolean:=action=''tick'';' IN source)>0 THEN RETURN; END IF;
 changed:=replace(source,'DECLARE board jsonb','DECLARE was_timeout boolean:=action=''tick''; board jsonb');
 IF changed=source THEN RAISE EXCEPTION 'Words timeout declaration preimage changed'; END IF;
 source:=changed;
 changed:=replace(source,'''points'',points)),''event''',
  '''points'',points)||CASE WHEN was_timeout THEN jsonb_build_object(''reason'',''timeout'') ELSE ''{}''::jsonb END),''event''');
 IF changed=source THEN RAISE EXCEPTION 'Words timeout move preimage changed'; END IF;
 EXECUTE changed;
END $migration$;
