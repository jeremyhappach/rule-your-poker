// Local combined-authority checks. No production connection or migration replay.
import assert from 'node:assert/strict';
import {readFileSync as read} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import {runFinancialProof} from '../battle31/financial-cases.mjs';
export async function captureBaseline(c){
 const functions=(await c.query("SELECT p.oid::regprocedure::text signature,replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)) definition,coalesce(p.proacl::text,'') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.prokind='f' AND p.proname NOT LIKE 'golf_%' ORDER BY signature")).rows;
 const defaults=(await c.query('SELECT to_jsonb(d) value FROM public.game_defaults d ORDER BY game_type')).rows;
 return {functions,defaults};
}
export async function verifyPreservation(c,before){
 const after=await captureBaseline(c);
 const addition="    WHEN v_game.game_type='six-card-golf' THEN\n      SELECT private.golf_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;\n";
 for(const old of before.functions){const now=after.functions.find(f=>f.signature===old.signature);assert(now,old.signature);assert.equal(now.acl,old.acl,old.signature+' ACL');
  let restored=now.definition;
  if(old.signature.startsWith('private.advance_ante_phase_exact(')){assert(restored.includes(addition));restored=restored.replace(addition,'');}
  if(old.signature==='private.megatouch_frozen_stake()')restored=restored.replace(",'battle-31','six-card-golf')",",'battle-31')");
  assert.equal(restored,old.definition,old.signature+' preserved');
 }
 assert.deepEqual(after.defaults.filter(x=>x.value.game_type!=='six-card-golf'),before.defaults);
 return {existingFunctions:before.functions.length,existingDefaults:before.defaults.length,onlyTwoAdditiveSharedChanges:true};
}
export async function runReleasedProofs(c){
 const battle=await runFinancialProof(c,{seedLocalHealth:true});
 await c.query('BEGIN');
 try{
  for(const name of ['core-proof','financial-proof','rollback-failure-proof','v2-controls-proof'])await c.query(read('supabase/race-poker/'+name+'.sql','utf8'));
  const source=read('dev/eleven-up/combined-production-proof.mjs','utf8');
  const match=/const controls=`([\s\S]*?)`;/.exec(source);assert(match,'11 Up controls proof');
  const array='ARRAY['+Array.from({length:6},()=>"'"+uuid()+"'::uuid").join(',')+']';
  const controls=match[1].replace('${array}',array);assert(!controls.includes('${'));
  await c.query("CREATE FUNCTION pg_temp.money_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'proof: %',label;END IF;END $$");
  await c.query(controls);
  await c.query('ROLLBACK');
  return {battle,racePoker:'rules, both-money financial/failure rollback and v2 controls',elevenUp:'Ready real pause/fake autoplay, reclaim, scoring clock and all-human safeguard'};
 }catch(e){await c.query('ROLLBACK');throw e;}
}
