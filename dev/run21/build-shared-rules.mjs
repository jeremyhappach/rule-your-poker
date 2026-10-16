import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import {createHash} from 'node:crypto';
const vite=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
try{
 const {RUN21_RULES}=await vite.ssrLoadModule('/src/lib/run21/rulesets.ts');
 const {duration}=await vite.ssrLoadModule('/src/lib/run21/rules.ts');
 const original=readFileSync('supabase/run21/shared-rules-base.sql','utf8').replace(/\r\n/g,'\n');
 let commit=original;
 const marker="  IF p_state#>>'{identity,sessionId}'";
 if(!commit.includes(marker))throw Error('commit guard boundary changed');
 const guard=`  -- A gameplay action computed before expiry must not defeat the persisted deadline after locking.
  IF m.gameplay_ruleset IS NOT NULL AND m.state#>>'{rounds,-1,active_player_id}' IS NOT NULL
    AND m.state#>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','result']='null'::jsonb
    AND (m.state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','deadline'])::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)
    AND p_state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','result','reason'] IS DISTINCT FROM 'timeout'
  THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision);END IF;
`;
 commit=commit.replace(marker,guard+marker);
 const hash=s=>createHash('md5').update(s).digest('hex');
 const check=`DO $$ BEGIN IF md5(pg_get_functiondef('public.run21_server_commit(uuid,bigint,jsonb,bigint)'::regprocedure)) NOT IN ('${hash(original)}','${hash(commit)}') THEN RAISE EXCEPTION 'run21:qualified_authority_changed';END IF;END $$;\n`;
 const sql=check+readFileSync('supabase/run21/shared-rules.template.sql','utf8').replaceAll('__RULES__',JSON.stringify(RUN21_RULES)).replace('__DURATION__',String(duration(RUN21_RULES)))+'\n'+commit+';\n';
 writeFileSync('supabase/run21/shared-rules.candidate.sql',sql.replace(/\r\n/g,'\n'));
}finally{await vite.close();}
