import fs from 'node:fs';
import crypto from 'node:crypto';
const originals = JSON.parse(fs.readFileSync('supabase/tests/replay/live-timing-originals.json', 'utf8'));
const finish = `
CREATE OR REPLACE FUNCTION private.replay_live_timing_finish_v1(_started timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $timing$
DECLARE elapsed numeric; total numeric; sections integer; headers jsonb; exposed text;
BEGIN
 IF _started IS NULL THEN RETURN; END IF;
 elapsed:=greatest(0,extract(epoch FROM clock_timestamp()-_started)*1000);
 total:=coalesce(nullif(current_setting('app.replay_live_ms',true),'')::numeric,0)+elapsed;
 sections:=coalesce(nullif(current_setting('app.replay_live_sections',true),'')::integer,0)+1;
 PERFORM set_config('app.replay_live_ms',total::text,true);
 PERFORM set_config('app.replay_live_sections',sections::text,true);
 headers:=coalesce(nullif(current_setting('response.headers',true),'')::jsonb,'[]');
 SELECT string_agg(e.value,', ') INTO exposed FROM jsonb_array_elements(headers) h CROSS JOIN LATERAL jsonb_each_text(h) e WHERE lower(e.key)='access-control-expose-headers';
 SELECT coalesce(jsonb_agg(h),'[]') INTO headers FROM jsonb_array_elements(headers) h
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_object_keys(h) k WHERE lower(k) IN ('x-ptown-replay-ms','x-ptown-replay-sections','access-control-expose-headers'));
 headers:=headers||jsonb_build_array(jsonb_build_object('X-Ptown-Replay-Ms',round(total,3)::text),
  jsonb_build_object('X-Ptown-Replay-Sections',sections::text),
  jsonb_build_object('Access-Control-Expose-Headers',concat_ws(', ',exposed,'X-Ptown-Replay-Ms, X-Ptown-Replay-Sections')));
 PERFORM set_config('response.headers',headers::text,true);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$timing$;
REVOKE ALL ON FUNCTION private.replay_live_timing_finish_v1(timestamptz) FROM PUBLIC,anon,authenticated,service_role;
`;
let sql='-- Temporary observation expires 2026-09-17 12:00 UTC. No replay contract or gameplay changes.\n'+finish;
for(const row of originals){
 const source=row.definition;
 const hash=crypto.createHash('md5').update(source).digest('hex');
 sql+=`\nDO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='${row.proname}' AND md5(pg_get_functiondef(p.oid))='${hash}') THEN RAISE EXCEPTION 'live_timing:owner_drift:${row.proname}'; END IF; END $guard$;\n`;
 const isJson=source.includes('RETURNS jsonb');
 const declaration="v_live_started timestamptz := CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END; "+(isJson?'v_live_result jsonb; ':'');
 const bodyStart=source.indexOf('AS $function$')+'AS $function$'.length;
 let body=source.slice(bodyStart);
 if(/\bDECLARE\b/.test(body)) body=body.replace(/\bDECLARE\b/,'DECLARE '+declaration);
 else body=body.replace(/\bBEGIN\b/,'DECLARE '+declaration+'\nBEGIN');
 body=body.replace(/\bRETURN\s+([^;]+);/g,(_,expr)=>`v_live_result := ${expr}; PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN v_live_result;`);
 body=body.replace(/\bRETURN;/g,'PERFORM private.replay_live_timing_finish_v1(v_live_started); RETURN;');
 const end=body.lastIndexOf('END;');
 body=body.slice(0,end)+'PERFORM private.replay_live_timing_finish_v1(v_live_started);\n'+body.slice(end);
 sql+=source.slice(0,bodyStart)+body+';\n';
}
fs.writeFileSync('supabase/tests/replay/live-timing.draft.sql',sql);
fs.writeFileSync('supabase/tests/replay/live-timing-recovery.sql',originals.map(x=>x.definition+';').join('\n')+'\nDROP FUNCTION private.replay_live_timing_finish_v1(timestamptz);\n');
