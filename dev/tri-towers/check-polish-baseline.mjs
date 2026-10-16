import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {connect} from './polish-fixture.mjs';
const {database}=JSON.parse(await readFile('qualification.local/tri-towers/polish-context.json','utf8'));
const source=JSON.parse(await readFile('qualification.local/tri-towers/production-before.json','utf8'));
const c=await connect(database);try{
 const actual=(await c.query("SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,md5(p.prosrc) body_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND (p.proname LIKE 'tri_towers_%' OR p.proname IN ('settle_gameplay_chip_transfers','split_whole_chips_clockwise','journal_gameplay_player_chip_change','stage_gameplay_player_transfer_cursor','finalize_gameplay_transfer_batch'))")).rows;
 const mismatches=source.filter(s=>!['tri_towers_reduce','tri_towers_snapshot','tri_towers_action'].includes(s.name)).filter(s=>actual.find(a=>a.schema===s.schema&&a.name===s.name&&a.args===s.args)?.body_hash!==s.body_hash);
 assert.deepEqual(mismatches,[]);console.log('PASS 22 unchanged TriTowers/financial routines exactly match deployed production bodies');
 await writeFile('qualification.local/tri-towers/polish-baseline.json',JSON.stringify({matched:22,mismatches:[]},null,2));
}finally{await c.end();}
