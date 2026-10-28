-- Local qualification baseline repair ONLY. Exact deployed definitions read
-- 2026-10-20; excluded from candidate and migration.
CREATE OR REPLACE FUNCTION private.capture_recovery_context() RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_object_agg(k,coalesce(current_setting(k,true),'')) FROM unnest(ARRAY[
 'request.jwt.claim.sub','request.jwt.claim.role','request.jwt.claims',
 'app.three_five_seven_authoritative_write','app.three_five_seven_recovery',
 'app.cribbage_authoritative_write','app.gin_rummy_authoritative_write',
 'app.yahtzee_authoritative_write','app.session_pause_write']) k
$$;
CREATE OR REPLACE FUNCTION private.restore_recovery_context(p_context jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item record;
BEGIN FOR item IN SELECT key,value FROM jsonb_each_text(p_context) LOOP PERFORM set_config(item.key,item.value,true); END LOOP; END
$$;
CREATE OR REPLACE FUNCTION private.shift_pause_timestamp(p_state jsonb,p_path text[],p_duration interval) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN nullif(p_state#>>p_path,'') IS NULL THEN p_state
 ELSE jsonb_set(p_state,p_path,to_jsonb((p_state#>>p_path)::timestamptz+p_duration),false) END
$$;
