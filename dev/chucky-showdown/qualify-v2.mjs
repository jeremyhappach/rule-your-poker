import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';

const [db,mode]=process.argv.slice(2);
if(!/^chucky_showdown_v2_\d+$/.test(db)||!['candidate','install','installed'].includes(mode))throw Error('Expected disposable v2 database and proof mode');
const file=readdirSync('supabase/migrations').filter(f=>f.endsWith('_chucky_showdown_v2.sql'));
assert.equal(file.length,1);
const ddl=readFileSync('supabase/migrations/'+file[0],'utf8');
const template=readFileSync('supabase/tests/chucky_showdown_v2_proof.sql','utf8');
const c=await connect(db);
try{
  if(mode==='install'){
    await c.query('begin');await c.query(ddl);await c.query('commit');
  }else{
    await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp()");
    const results=await c.query(mode==='candidate'?template.replace('-- CANDIDATE_DDL',()=>ddl):template);
    const row=results.at(-1).rows[0];
    assert.equal(row.installed,mode==='installed');
    for(const key of ['fixture_users','fixture_runs','v2_enabled'])assert.equal(Number(row[key]),0);
    console.log(JSON.stringify(row));
  }
}finally{await c.end();}
