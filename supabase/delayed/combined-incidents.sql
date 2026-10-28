-- The existing incident owner also shifts active Quintzee presentation holds.
DO $$ DECLARE source_i text;old_i text;new_i text;BEGIN
 source_i:=pg_get_functiondef('private.delayed_incident_close(uuid,text)'::regprocedure);
 old_i:='IF s->>''segmentStartedAt'' IS NOT NULL THEN';
 IF position(old_i IN source_i)=0 THEN RAISE EXCEPTION 'delayed:incident_source_changed';END IF;
 new_i:='IF c.game_type=''quintzee'' AND (s#>>''{board,celebration,endsAt}'')::bigint>floor(extract(epoch FROM incident.opened_at)*1000) THEN
 s:=jsonb_set(s,''{board,celebration}'',(s#>''{board,celebration}'')||jsonb_build_object(
 ''startedAt'',(s#>>''{board,celebration,startedAt}'')::bigint+ms,
 ''countAt'',(s#>>''{board,celebration,countAt}'')::bigint+ms,
 ''endsAt'',(s#>>''{board,celebration,endsAt}'')::bigint+ms));END IF; ';
 EXECUTE replace(source_i,old_i,new_i||old_i);
END $$;
