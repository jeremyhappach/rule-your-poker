// Package exact deployed owners; change only Gin replay admission and capture.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root='supabase/tests/replay/';
const defs=JSON.parse(readFileSync(root+'gin-waiting-originals.json','utf8'));
const extra=new Set(['decline_session_setup','advance_ante_phase_exact','handle_config_deadline_timeout_exact','resolve_postgame_participation','configure_dealer_game','submit_ante_decision']);
const existing=defs.filter(d=>d.definition.includes('THEN v_replay_shared:=private.replay_gin_shared_begin_v1('));
const added=defs.filter(d=>extra.has(d.name)&&!(d.schema==='public'&&['resolve_postgame_participation','advance_ante_phase_exact','handle_config_deadline_timeout_exact'].includes(d.name)));
if(existing.length!==17||added.length!==6)throw Error('Unexpected owner inventory');
const generated=[];
for(const d of existing){let s=d.definition;
 s=s.replace(/IF (\w+)\.replay_contract_version=1 AND \1\.game_type='gin-rummy' THEN v_replay_shared:=private\.replay_gin_shared_begin_v1\(\1\.id,'([^']+)'\); END IF;/g,
  (_,g,source)=>`IF ${g}.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(${g},'${source}',true); END IF;`);
 if(s===d.definition)throw Error('Admission anchor: '+d.identity);generated.push(s+';');
}
for(const d of added){let s=d.definition;
 const locks=[...s.matchAll(/SELECT\s+\*\s+INTO\s+(\w+)\s+FROM\s+public\.games[\s\S]*?FOR UPDATE[^;]*;/g)];
 if(locks.length!==1)throw Error('Expected existing game lock: '+d.identity);
 const g=locks[0][1],source=d.schema+'.'+d.name,args=d.args.split(',').map(a=>a.trim().split(' ')[0]);
 const operands=`jsonb_build_object(${args.flatMap(a=>[`'${a}'`,a]).join(',')})`;
 const ret=s.match(/RETURNS\s+(\w+)/i)[1];
 s=s.replace(/\bDECLARE\b/,`DECLARE v_replay_shared jsonb; v_replay_return ${ret};`);
 s=s.replace(/\bRETURN\s+((?:'(?:''|[^'])*'|[^;'])+);/g,(_,expr)=>`v_replay_return := ${expr};\n IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,${operands},to_jsonb(v_replay_return)); END IF;\n RETURN v_replay_return;`);
 s=s.replace(locks[0][0],locks[0][0]+`\n IF FOUND THEN\n  IF ${g}.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(${g},'${source}',false,${operands}); END IF;\n  PERFORM 1; -- Preserve the original missing-row guard.\n END IF;`);
 if(d.name==='configure_dealer_game'){
  s=s.replace('SET game_type=p_game_type,',"SET game_type=p_game_type,\n         replay_contract_version=CASE WHEN p_game_type='gin-rummy' THEN game.replay_contract_version ELSE NULL END,");
 }
 if(d.name==='submit_ante_decision'){
  const anchor='   WHERE id=p_player_id;';
  if(s.split(anchor).length!==2)throw Error('Ante decision anchor');
  s=s.replace(anchor,anchor+"\n  IF v_replay_shared IS NOT NULL THEN v_replay_shared:=v_replay_shared||jsonb_build_object('anteDecisionRoster',private.replay_gin_roster_v1(p_game_id)); END IF;");
 }
 generated.push(s+';');
}
const open=defs.find(d=>d.name==='replay_gin_open_v1');
const opening=open.definition.replace("'captureContract','gin-replay/1',","'captureContract','gin-replay/1','lifecycleCaptureContract','gin-lifecycle/2',")
 .replace("'coverage','hand_boundary','rules',v_context #> '{checkpoint,rules}'", "'coverage','hand_boundary','rules',v_context #> '{checkpoint,rules}','trigger',coalesce(nullif(current_setting('app.replay_gin_opening_cause',true),'')::jsonb,'null'::jsonb)");
if(opening===open.definition)throw Error('Opening contract anchor');
const end=defs.find(d=>d.name==='replay_gin_shared_end_v1');let ending=end.definition;
ending=ending.replace(" IF _capture IS NULL THEN RETURN; END IF;",` IF _capture IS NULL THEN RETURN; END IF;
 -- An enclosing ante action can open a new hand. Its opening checkpoint owns
 -- that committed boundary; never append the predecessor after that opening.
 IF (SELECT body #>> '{identity,roundId}' FROM private.replay_steps
     WHERE session_id=(_capture #>> '{context,identity,sessionId}')::uuid ORDER BY sequence DESC LIMIT 1)
    IS DISTINCT FROM _capture->>'round' THEN
  PERFORM set_config('app.replay_gin_shared_root','',true); PERFORM set_config('app.replay_gin_opening_cause','',true); RETURN;
 END IF;`);
ending=ending.replace(" SELECT value->>'playerId' INTO actor FROM jsonb_array_elements(a->'roster') WHERE value->>'userId'=auth.uid()::text LIMIT 1;", " actor:=_capture->>'actorId';");
ending=ending.replace(' previous:=b;',` previous:=b;
 IF _capture ? 'anteDecisionRoster' THEN
  middle:=jsonb_set(previous,'{roster}',_capture->'anteDecisionRoster');
  parts:=parts||jsonb_build_array(jsonb_build_object('type','session.ante_decision','source',_capture->>'source','actorId',actor,
   'targets',jsonb_build_array(_operands->'p_player_id'),'origin',CASE WHEN actor IS NULL THEN 'system' ELSE 'player' END,
   'operands',_operands,'delta',private.replay_diff_v1(previous,middle),'scores','[]'::jsonb,'transfers','[]'::jsonb));
  previous:=middle;
 END IF;`);
ending=ending.replace("'type','session.'||split_part(_capture->>'source','.',2)","'type',CASE WHEN _capture->>'source'='public.configure_dealer_game' AND g.game_type IS DISTINCT FROM 'gin-rummy' THEN 'session.game_handoff' ELSE 'session.'||split_part(_capture->>'source','.',2) END");
ending=ending.replace(' UPDATE private.gin_rummy_round_states SET replay_context_v1=c WHERE round_id=r.id;'," IF s->>'phase'<>'complete' THEN UPDATE private.gin_rummy_round_states SET replay_context_v1=c WHERE round_id=r.id; END IF;");
ending=ending.replace(" PERFORM set_config('app.replay_gin_shared_root','',true);\n IF d=", " PERFORM set_config('app.replay_gin_shared_root','',true);\n PERFORM set_config('app.replay_gin_opening_cause','',true);\n IF d=");
const begin=`CREATE OR REPLACE FUNCTION private.replay_gin_lifecycle_begin_v2(_game public.games,_source text,_allow_legacy boolean DEFAULT false,_operands jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE c jsonb;s jsonb;r uuid;b jsonb;ending jsonb;actor text;
BEGIN
 IF _game.replay_contract_version IS DISTINCT FROM 1 OR (_game.game_type IS NOT NULL AND _game.game_type<>'gin-rummy')
 OR coalesce(current_setting('app.replay_gin_shared_root',true),'')<>'' THEN RETURN NULL; END IF;
 SELECT (body #>> '{identity,roundId}')::uuid,body #> '{closing,endingState}' INTO r,ending FROM private.replay_steps
 WHERE session_id=_game.id ORDER BY sequence DESC LIMIT 1;
 SELECT gr.replay_context_v1,gr.state INTO c,s FROM private.gin_rummy_round_states gr WHERE gr.round_id=r;
 IF c IS NULL THEN RETURN NULL; END IF;
 -- No backfill of older incomplete boundaries. Existing active Gin hooks keep
 -- their prior behavior until the next authoritative opening enrolls v2.
 IF c #>> '{checkpoint,lifecycleCaptureContract}' IS DISTINCT FROM 'gin-lifecycle/2'
 AND NOT (_allow_legacy AND _game.game_type IS NOT DISTINCT FROM 'gin-rummy') THEN RETURN NULL; END IF;
 IF ending IS NOT NULL THEN c:=jsonb_set(c,'{checkpoint}',ending-ARRAY['gameState','visibility','privateCatalog']); END IF;
 b:=private.replay_gin_state_v1(s,c);
 IF _source LIKE 'public.%' THEN SELECT value->>'playerId' INTO actor FROM jsonb_array_elements(b->'roster') WHERE value->>'userId'=auth.uid()::text LIMIT 1; END IF;
 PERFORM set_config('app.replay_gin_shared_root',_source,true);
 PERFORM set_config('app.replay_gin_opening_cause',jsonb_build_object('contract','gin-lifecycle/2','source',_source,'actorId',actor,'operands',_operands,'previousIdentity',c->'identity')::text,true);
 RETURN jsonb_build_object('context',c,'before',b,'round',r,'source',_source,'actorId',actor);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_lifecycle_begin_v2(public.games,text,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;`;
const changed=[...existing,...added,open,end];
const guards=changed.map(d=>` IF md5(pg_get_functiondef('${d.identity}'::regprocedure)) IS DISTINCT FROM '${createHash('md5').update(d.definition).digest('hex')}' THEN RAISE EXCEPTION 'gin lifecycle owner drift: ${d.identity}'; END IF;`).join('\n');
const sql="SET LOCAL lock_timeout='5s';\nSET LOCAL check_function_bodies=false;\nDO $guard$ BEGIN\n"+guards+'\nEND $guard$;\n'+begin+'\n'+opening+';\n'+ending+';\n'+generated.join('\n');
writeFileSync(root+'gin-waiting-v2.sql',sql);
writeFileSync(root+'gin-waiting-recovery.sql',readFileSync(root+'gin-production-recovery.sql','utf8')+'\n'+added.map(d=>d.definition+';').join('\n'));
console.log(JSON.stringify({existingSharedOwners:existing.length,newOwners:added.length,changed:changed.length,bytes:sql.length}));
