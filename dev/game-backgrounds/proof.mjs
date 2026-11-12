import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {openWordsDatabase} from '../words-gameplay/database.mjs';
process.env.PTOWN_WORDS_PG_MODULE??='C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const db=await openWordsDatabase(process.argv[2]);
const candidate=readFileSync('supabase/game-backgrounds/candidate.sql','utf8');
const backfill=readFileSync('supabase/game-backgrounds/backfill.sql','utf8');
const photos=JSON.parse(readFileSync('src/lib/gameBackgrounds/photos.json','utf8'));
mkdirSync('qualification.local/game-backgrounds',{recursive:true});
const evidence=[];
const snapshot=f=>db.rpc(f.user,f.mode==='live'?'ptown_words_snapshot':'delayed_words_snapshot',f.mode==='live'?{p_dealer_game_id:f.id}:{p_child:f.id});
try{
 const old=[await db.prepare('live'),await db.prepare('async')];
 const before=await Promise.all(old.map(f=>db.row(f)));
 const parentBefore=await db.sql('SELECT revision FROM private.delayed_matches WHERE id=$1',[old[1].match]);
 const rollback=await db.connect();
 try{
  await rollback.query('BEGIN');await rollback.query(candidate);await rollback.query(backfill);
  assert((await rollback.query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[old[0].id])).rows[0].state.backgroundId);
  await rollback.query('ROLLBACK');
 }finally{rollback.release();}
 assert.deepEqual(await db.row(old[0]),before[0],'Candidate and backfill roll back completely');
 await db.execute(candidate);
 const first=await db.connect(),second=await db.connect();
 try{
  await first.query('BEGIN');await first.query(backfill);
  const competing=second.query(backfill);
  await first.query('COMMIT');await competing;
 }finally{first.release();second.release();}
 assert.equal(Number((await db.sql('SELECT revision FROM private.delayed_matches WHERE id=$1',[old[1].match])).revision),Number(parentBefore.revision)+1,'One parent realtime revision for competing backfills');
 assert.equal((await db.sql('SELECT count(*)::int AS n FROM public.delayed_match_updates WHERE match_id=$1 AND revision=$2',[old[1].match,Number(parentBefore.revision)+1])).n,2,'Both Async devices receive the existing realtime signal');
 for(const [index,f]of old.entries()){
  const row=await db.row(f),id=row.state.backgroundId;
  assert(photos.some(photo=>photo.id===id));
  const {backgroundId,...state}=row.state;
  assert.deepEqual(state,before[index].state,'Only presentation metadata changes');
  assert.equal(Number(row.revision),Number(before[index].revision)+1);
  const first=await snapshot(f);
  writeFileSync(`qualification.local/game-backgrounds/${f.mode}.json`,JSON.stringify(first));
  assert.equal(first.backgroundId,id,'Canonical projection exposes the assignment');
  const peer=await db.rpc(f.other,f.mode==='live'?'ptown_words_snapshot':'delayed_words_snapshot',f.mode==='live'?{p_dealer_game_id:f.id}:{p_child:f.id});
  assert.equal(peer.backgroundId,id,'Both participants agree');
  await db.execute(backfill);
  const replay=await db.row(f);
  assert.equal(replay.state.backgroundId,id);
  assert.equal(replay.revision,row.revision,'Backfill replay writes nothing');
  await db.sql(`UPDATE private.${f.table} SET state=state-'backgroundId',revision=revision+1 WHERE ${f.key}=$1`,[f.id]);
  assert.equal((await db.row(f)).state.backgroundId,id,'Reducer replacement cannot erase assignment');
  evidence.push({mode:f.mode,backgroundId:id,backfill:'pass',projection:'pass',replay:'pass',statePreserved:true});
 }
 const only=photos.find(p=>!evidence.some(row=>row.backgroundId===p.id)).id;
 await db.sql('UPDATE private.game_background_pool SET active=(id=$1)',[only]);
 for(const mode of ['live','async']){
  const f=await db.prepare(mode);
  assert.equal((await snapshot(f)).backgroundId,only,'New games use the current active pool');
  evidence.push({mode,creation:'pass',activePool:'pass'});
 }
 for(const [i,f]of old.entries())assert.equal((await db.row(f)).state.backgroundId,evidence[i].backgroundId,'Retirement cannot change an assigned game');
 await db.execute(candidate);
 assert.equal((await db.sql('SELECT count(*)::int AS n FROM private.game_background_pool WHERE active')).n,1,'Candidate rerun does not reactivate retired photos');
 const unauth=await db.connect();
 try{
  await unauth.query('BEGIN');await unauth.query('SET LOCAL ROLE authenticated');
  await assert.rejects(unauth.query('SELECT private.choose_game_background()'),/permission denied/);
  await unauth.query('ROLLBACK');
 }finally{unauth.release();}
 evidence.push({rollback:'pass',concurrentBackfill:'pass',unauthorizedSelection:'rejected',retirement:'pass'});
 mkdirSync('qualification.local/game-backgrounds',{recursive:true});
 writeFileSync('qualification.local/game-backgrounds/proof.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence));
}finally{await db.close();}
