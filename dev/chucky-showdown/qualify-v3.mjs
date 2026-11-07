import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const [db,mode='candidate']=process.argv.slice(2);
const candidate=mode==='candidate'||mode==='generate';
if(!/^chucky_showdown_v3_\d+$/.test(db)||!['candidate','install','installed','generate'].includes(mode))throw Error('Expected disposable v3 database and mode');
const ddl=readFileSync('supabase/migrations/20261107141549_chucky_showdown_v3_hotfix.sql','utf8');
const legacy=readFileSync('supabase/tests/chucky_showdown_v2_proof.sql','utf8');
const reset="UPDATE private.arcade_rulesets SET enabled=false WHERE game='chucky-showdown' AND enabled; UPDATE private.arcade_rulesets SET enabled=true WHERE id='chucky-showdown/1';";
let proof=legacy.replaceAll('chucky-showdown/2','chucky-showdown/3')
 .replaceAll("='700'","='3000'").replaceAll("='6300'","='18800'").replaceAll("='5600'","='15800'")
 .replace('=100*lvl',"=private.chucky_showdown_bonus(v->'config',lvl)");
proof=proof.replace("  -- CANDIDATE_DDL","  -- CANDIDATE_DDL\n  "+reset);
// Cover all frozen values, old v2 completion, accepted fold receipts and terminal abandon.
proof=proof.replace("  legacy:=",`  FOR n IN 1..7 LOOP
    PERFORM pg_temp.cs_check(private.chucky_showdown_bonus('{"version":"chucky-showdown/2"}',n)=100*n,'old bonus '||n);
    PERFORM pg_temp.cs_check(private.chucky_showdown_bonus((SELECT config FROM private.arcade_rulesets WHERE id='chucky-showdown/3'),n)=('[100,250,500,800,1250,2000,3000]'::jsonb->>(n-1))::int,'new bonus '||n);
  END LOOP;
  legacy:=`);
proof=proof.replace("  PERFORM pg_temp.cs_check(v->'uses'->6",`  PERFORM pg_temp.cs_check(v->'config'=(SELECT config FROM private.arcade_rulesets WHERE id='chucky-showdown/3'),'frozen admitted bonus config');
  PERFORM pg_temp.cs_check(v->'uses'->6`);
proof=proof.replace("    IF n<3 THEN PERFORM",`    PERFORM pg_temp.cs_check(v#>>'{lastFold,phase}'='fold' AND jsonb_array_length(v#>'{lastFold,community}')=2 AND v#>'{lastFold,chucky}'='[]','accepted fold receipt redacts hidden cards');
    IF n<3 THEN PERFORM`);
proof=proof.replace("  SET CONSTRAINTS ALL IMMEDIATE;",`  -- An abandoned run is terminal and cannot produce a result, even on duplicate delivery.
  v:=public.arcade_start(a,gen_random_uuid(),'chucky-showdown');
  v:=public.arcade_chucky_showdown_step(a,(v->>'id')::uuid)->'projection';old:=v;req:=gen_random_uuid();
  v:=pg_temp.cs_act(a,v,'abandon',NULL,req);
  PERFORM pg_temp.cs_check(v->>'status'='abandoned' AND NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=(v->>'id')::uuid),'abandoned has no result');
  result:=public.arcade_chucky_showdown_step(a,(v->>'id')::uuid,(old->>'revision')::bigint,old->>'roundId',req,'abandon');
  PERFORM pg_temp.cs_check(result->>'outcome'='duplicate' AND result#>>'{projection,status}'='abandoned','abandon duplicate');
  PERFORM pg_temp.cs_check(public.arcade_chucky_showdown_step(a,(v->>'id')::uuid)#>>'{projection,status}'='abandoned','abandon reload');
  SET CONSTRAINTS ALL IMMEDIATE;`);
writeFileSync('supabase/tests/chucky_showdown_v3_proof.sql',proof);
const oldProof=legacy.replace('-- CANDIDATE_DDL',()=> (candidate?ddl:'')+'\n'+reset);
const newProof=proof.replace('-- CANDIDATE_DDL',()=>candidate?ddl:'');
writeFileSync('qualification.local/chucky-v3-proof.sql',oldProof+'\n'+newProof);
if(mode==='generate')process.exit(0);
const c=await connect(db);
try{
 await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp()");
 if(mode==='install'){await c.query('begin');await c.query(ddl);await c.query('commit');console.log('Installed local v3');}
 else{
  for(const [version,sql] of [['v2',oldProof],['v3',newProof]]){
   const results=await c.query(sql),row=results.at(-1).rows[0];
   assert.equal(Number(row.fixture_users),0);
   console.log(JSON.stringify({version,...row}));
  }
 }
}finally{await c.end();}
