import {connect} from '../quintzee/database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {states,score} from './horses-ev.mjs';
import {evaluate,exhaustive,simulateRound} from './drop-simulation.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/coordinated/context.json'));
if(!/^coordinated_scores_\d+$/.test(database))throw Error('Disposable local database only');
const c=await connect(database),baseline=JSON.parse(readFileSync('qualification.local/coordinated-db-baseline.json'));
const candidate=readFileSync('supabase/coordinated-score-release/candidate.sql','utf8');
try{
 // Refresh only inspected scoring owners in the disposable clone to the exact
 // deployed definitions, then prove the candidate under those boundaries.
 await c.query('BEGIN');
 for(const definition of Object.values(baseline.definitions))await c.query(definition);
 for(const rule of baseline.rules)await c.query('INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET config=excluded.config,enabled=excluded.enabled',[rule.id,rule.game,rule.config,rule.enabled]);
 await c.query('COMMIT');
 const oldConfigs=(await c.query("SELECT id,config FROM private.arcade_rulesets WHERE id NOT IN('horses-blitz/5','357-drop/6') ORDER BY id")).rows;
 const oldHorses=(await c.query("SELECT d,roll,v,private.horses_blitz_set(d,roll,private.horses_blitz_rules(v)) result FROM (SELECT to_jsonb(ARRAY[a,b,c,d,e]) d FROM generate_series(1,6)a,generate_series(1,6)b,generate_series(1,6)c,generate_series(1,6)d,generate_series(1,6)e WHERE a<=b AND b<=c AND c<=d AND d<=e) dice CROSS JOIN generate_series(1,3)roll CROSS JOIN unnest(ARRAY['horses-blitz/1','horses-blitz/2','horses-blitz/3','horses-blitz/4'])v ORDER BY d,roll,v")).rows;
 await c.query(candidate);
 assert.deepEqual((await c.query("SELECT id,config FROM private.arcade_rulesets WHERE id NOT IN('horses-blitz/5','357-drop/6') ORDER BY id")).rows,oldConfigs);
 const newOldHorses=(await c.query("SELECT d,roll,v,private.horses_blitz_set(d,roll,private.horses_blitz_rules(v)) result FROM (SELECT to_jsonb(ARRAY[a,b,c,d,e]) d FROM generate_series(1,6)a,generate_series(1,6)b,generate_series(1,6)c,generate_series(1,6)d,generate_series(1,6)e WHERE a<=b AND b<=c AND c<=d AND d<=e) dice CROSS JOIN generate_series(1,3)roll CROSS JOIN unnest(ARRAY['horses-blitz/1','horses-blitz/2','horses-blitz/3','horses-blitz/4'])v ORDER BY d,roll,v")).rows;
 assert.deepEqual(newOldHorses,oldHorses);console.log('PASS: all 3024 frozen historical Horses state/roll/version offers unchanged; every old registry config unchanged.');
 const cfg=JSON.parse(readFileSync('dev/coordinated-score-release/horses-v5.json'));
 const dice=states.map(s=>s.flatMap((n,f)=>Array(n).fill(f+1)));
 const offers=(await c.query("SELECT d,roll,private.horses_blitz_set(d,roll,private.horses_blitz_rules('horses-blitz/5')) offer FROM jsonb_array_elements($1::jsonb)d CROSS JOIN generate_series(1,3)roll",[JSON.stringify(dice)])).rows;
 for(const o of offers){const counts=Array.from({length:6},(_,i)=>o.d.filter(x=>x===i+1).length);assert.equal(o.offer.points,score(counts,o.roll,cfg));}
 console.log('PASS: all 756 new Horses offers match independent integer arithmetic.');
 const threes=(await c.query("SELECT ARRAY[a,b,c] cards,private.drop357_lane(ARRAY[a,b,c],3,private.drop357_v6_rules()) r FROM generate_series(0,51)a,generate_series(0,51)b,generate_series(0,51)c WHERE a<b AND b<c")).rows;
 for(const r of threes){const x=evaluate(r.cards,3,6);assert.equal(r.r.score,x.score);assert.deepEqual(r.r.vector,x.vector);assert.equal(r.r.natural,x.natural);}
 console.log('PASS:',threes.length,'exhaustive 3s hands match SQL; six examples and trips>all pairs.',JSON.stringify(exhaustive()));
 for(let i=0;i<120;i++)for(const policy of ['sequential','balanced','aggressive3']){const s=simulateRound(i*991+357,6,policy);for(let lane=1;lane<3;lane++){const cards=s.rows[lane],size=[3,5,7][lane],r=(await c.query('SELECT private.drop357_lane($1,$2) r',[cards,size])).rows[0].r;assert.equal(r.score,s.values[lane].score,JSON.stringify({cards,size,r,expected:s.values[lane]}));assert.deepEqual(r.vector,s.values[lane].vector);assert.equal(r.natural,s.values[lane].natural);}}
 console.log('PASS: 720 simulated carry / 5s / best-five-of-7s outcomes match deployed SQL.');
 for(const [path,oldVersion,newVersion] of [['supabase/ptown-polish/horses-proof.sql','horses-blitz/4','horses-blitz/5'],['supabase/ptown-polish/drop-proof.sql','357-drop/5','357-drop/6']]){
  for(const version of [oldVersion,newVersion]){let proof=readFileSync(path,'utf8').replaceAll(oldVersion,version);
   // Proofs containing fixed v4 score/time assertions are maintained separately.
   if(version===newVersion&&version.startsWith('horses'))proof=proof.replace('9000','2700');
   await c.query(proof);console.log('PASS: full lifecycle / receipts / ownership / rollback proof',version);
  }
 }
 writeFileSync('qualification.local/coordinated/local-proof.json',JSON.stringify({database,passed:true,oldHorses:3024,newHorses:756,threeHands:22100,carryOutcomes:720}));
}finally{await c.end();}
