import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {connect} from './bots-fixture.mjs';
const read=path=>readFile(path,'utf8').then(JSON.parse);
const installed=await read('qualification.local/tri-towers/v2-installed.json'),qualified=await read('dev/tri-towers/v2.evidence.json'),baseline=await read('qualification.local/tri-towers/v2-captured-baseline.json');
const {database}=await read('qualification.local/tri-towers/v2-context.json'),c=await connect(database);
try{
 for(const f of qualified.definitions){const actual=installed.functions.find(x=>x.signature===f.signature);assert.equal(actual?.hash,f.hash,f.signature);assert(actual.definition);await c.query(actual.definition);assert.equal((await c.query('SELECT md5(pg_get_functiondef($1::regprocedure)) h',[f.signature])).rows[0].h,actual.hash);}
 const changed=new Set(['private.tri_towers_rules()','private.tri_towers_deal(jsonb,bigint)','private.tri_towers_reduce(jsonb,text,integer,bigint)','private.tri_towers_bot_choice(jsonb,bigint)','tri_towers_snapshot(uuid)']);
 for(const [sig,hash]of Object.entries(baseline.allHashes))if(!changed.has(sig))assert.equal(installed.functions.find(f=>f.signature===sig)?.hash,hash,sig);
 assert.equal(installed.release.enabled,true);assert.equal(installed.release.admission_enabled,false);assert.equal(installed.backlog,0);
 console.log('PASS installed version definitions match candidate; all other functions, settlement and financial infrastructure unchanged; admission remains closed.');
}finally{await c.end();}
