import {connect,rpcFor} from '../database.mjs';
import {createServer} from 'vite';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
// connect() hardcodes 127.0.0.1:55439 and rejects non-qualification database names.
const source='mega_golf_1792719651984',database='mega_golf_seq_'+Date.now(),passed=[];
const admin=await connect('template1');
await admin.query('CREATE DATABASE '+database+' TEMPLATE '+source);await admin.end();
const db=await connect(database),peer=await connect(database),rpc=rpcFor(db),peerRpc=rpcFor(peer);
const vite=await createServer({configFile:false,cacheDir:resolve('dev/mega-card-golf/polish/evidence.local/proof-cache'),server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const out='dev/mega-card-golf/polish/evidence.local/sequential-opening-database.json';
const pass=name=>{passed.push(name);console.log('PASS',name);};
try{
 const {megaOperation}=await vite.ssrLoadModule('/server/megaCardGolf/service.ts');
 const {recoverRun,createRun}=await vite.ssrLoadModule('/src/lib/megaCardGolf/engine.ts');
 const indexes=(await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='private' AND tablename IN('arcade_runs','arcade_command_receipts','arcade_results')")).rows;
 assert(indexes.some(i=>i.indexdef.includes('request_id')&&i.indexdef.includes('UNIQUE')));
 const hash=async()=> (await db.query("SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'|' ORDER BY run_id),'')) value FROM private.arcade_results r")).rows[0].value;
 const historical=await hash();
 const actors=(await db.query("SELECT id FROM public.profiles p WHERE private.arcade_allowed(id) AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p.id) AND NOT EXISTS(SELECT 1 FROM private.arcade_runs r WHERE r.user_id=p.id AND r.status='active') LIMIT 2")).rows.map(r=>r.id);
 assert.equal(actors.length,2,'Need two existing allowed, idle local identities');
 const [actor,other]=actors;
 await db.query("INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('mega-card-golf/2','mega-card-golf','{\"engine\":\"mega-card-golf/2\",\"opening\":\"sequential\"}',false) ON CONFLICT(id) DO NOTHING");
 const fixture=async(ruleset='mega-card-golf/2')=>{
  // Explicit qualification admission only: deployed start/catalog still select v1.
  // No admission function or enabled flag is changed, even in this clone.
  return (await db.query("INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) SELECT $1,'mega-card-golf',$2,private.mega_config(c),floor(extract(epoch FROM clock_timestamp())*1000) FROM private.arcade_mega_configs c JOIN private.arcade_mega_courses p ON p.config_id=c.id WHERE p.id='sunny-meadows' RETURNING id",[actor,ruleset])).rows[0].id;
 };
 const state=(id,client=rpc,who=actor)=>megaOperation(client,who,{op:'state',runId:id});
 const open=(v,index,requestId=randomUUID(),client=rpc,who=actor)=>megaOperation(client,who,{op:'action',runId:v.id,revision:v.revision,hole:v.hole,requestId,intent:{type:'open',indices:[index]}});
 // Whole first proof is rollback-contained and leaves no new runs or receipts.
 await db.query('BEGIN');
 const id=await fixture(),initial=await state(id),requestId=randomUUID(),first=await open(initial,1,requestId);
 assert.equal(first.ruleset,'mega-card-golf/2');assert.equal(first.phase,'opening');assert.equal(first.cards.filter(c=>c!==null).length,1);assert.equal(first.deadline,initial.deadline);
 assert.equal(first.cards[1]!==null,true);assert.equal(first.cards[4],null);assert.equal('decks' in first,false);
 assert.deepEqual((await open(initial,1,requestId)).cards,first.cards);assert.deepEqual((await state(id)).cards,first.cards);
 await assert.rejects(()=>open(first,1),/opening/);await assert.rejects(()=>open(initial,4),/stale_action/);
 await db.query('SAVEPOINT owner_check');await assert.rejects(()=>state(id,rpc,other),/not_found/);await db.query('ROLLBACK TO SAVEPOINT owner_check');
 const second=await open(first,4);assert.equal(second.phase,'playing');assert.equal(second.cards.filter(c=>c!==null).length,2);assert.deepEqual(second.config,initial.config);
 await assert.rejects(()=>open(second,3),/Invalid action/);
 assert.deepEqual((await open(initial,1,requestId)).cards,second.cards);
 pass('SQL receipts: one reveal, private projection, duplicate/late replay, reconnect, stale input, count limit and ownership');
 // State version/configuration are frozen by the actual SQL commit boundary.
 const row=await rpc('arcade_load',{p_actor:actor,p_run:id});
 await db.query('SAVEPOINT mismatch');
 await assert.rejects(()=>rpc('arcade_mega_commit',{p_actor:actor,p_run:id,p_revision:row.revision,p_state:{...row.state,ruleset:'mega-card-golf/1'}}),/invalid_state/);
 await db.query('ROLLBACK TO SAVEPOINT mismatch');
 const closed=recoverRun(row.state,row.state.deadline),advanced=recoverRun(closed,closed.deadline);
 assert.equal(advanced.ruleset,'mega-card-golf/2');assert.deepEqual(advanced.results,closed.results);assert.deepEqual(advanced.config,row.config);
 await rpc('arcade_mega_commit',{p_actor:actor,p_run:id,p_revision:row.revision,p_state:advanced});
 const resumed=await state(id);assert.equal(resumed.hole,2);assert.equal(resumed.phase,'opening');assert.equal(resumed.cards.filter(c=>c!==null).length,0);
 await db.query('ROLLBACK');assert.equal(await hash(),historical);
 assert.equal(Number((await db.query('SELECT count(*) FROM private.arcade_runs WHERE id=$1',[id])).rows[0].count),0);
 pass('Frozen v2/config, subsequent hole, historical outcomes and complete rollback');
 // Independent connections race against actual row locks + compare-and-swap.
 const racedId=await fixture(),raced=await state(racedId);
 const race=await Promise.allSettled([open(raced,0,randomUUID(),rpc),open(raced,5,randomUUID(),peerRpc)]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected').length,1);
 const winner=await state(racedId);assert.equal(winner.cards.filter(c=>c!==null).length,1);assert.equal(winner.phase,'opening');
 const hidden=winner.cards.findIndex(c=>c===null),raceId=randomUUID();
 const duplicate=await Promise.all([open(winner,hidden,raceId,rpc),open(winner,hidden,raceId,peerRpc)]);
 assert(duplicate.every(v=>v.cards.filter(c=>c!==null).length===2));
 assert.equal(Number((await db.query('SELECT count(*) FROM private.arcade_command_receipts WHERE user_id=$1 AND request_id=$2',[actor,raceId])).rows[0].count),1);
 pass('Two independent PostgreSQL connections: competing choices commit one; concurrent same-request retry commits once');
 const pending=await state(racedId);
 await megaOperation(rpc,actor,{op:'action',runId:racedId,requestId:randomUUID(),revision:pending.revision,hole:pending.hole,intent:{type:'abandon'}});
 const legacyId=await fixture('mega-card-golf/1'),legacy=await state(legacyId);
 await assert.rejects(()=>open(legacy,0),/opening/);
 const paired=await megaOperation(rpc,actor,{op:'action',runId:legacyId,requestId:randomUUID(),revision:legacy.revision,hole:legacy.hole,intent:{type:'open',indices:[0,5]}});
 assert.equal(paired.ruleset,'mega-card-golf/1');assert.equal(paired.phase,'playing');
 assert.equal(await hash(),historical);pass('Existing v1 pair behavior and all historical results preserved');
 // Also verify initialization cannot silently upgrade a previously admitted v1 row.
 assert.equal(createRun(legacyId,actor,legacy.config,Array.from({length:legacy.config.holes},()=>Array.from({length:52},(_,i)=>i)),Date.now()).ruleset,'mega-card-golf/1');
 writeFileSync(out,JSON.stringify({database,source,host:'127.0.0.1',port:55439,passed,indexes,historicalResultsUnchanged:true,productionWrites:0,admissionChanges:0,limitation:'v2 fixture rows seeded explicitly; production registration/start selection is not implemented or activated'},null,2));
}catch(e){writeFileSync(out,JSON.stringify({database,source,passed,error:String(e),productionWrites:0},null,2));throw e;}
finally{await vite.close();await peer.end();await db.end();}
