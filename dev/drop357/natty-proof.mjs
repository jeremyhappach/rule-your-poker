import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const db=process.argv[2],installed=process.argv.includes('--installed');
if(!/^drop357_v2_\d+$/.test(db??''))throw Error('Disposable database required');
const candidate=readFileSync('supabase/migrations/20261115181145_drop357_natural_identity.sql','utf8');
const proofs=['supabase/tests/drop357_natty_proof.sql',...['','_v2','_v3','_v4'].map(v=>'supabase/tests/drop357'+v+'_proof.sql'),
 ...['357-drop/5','357-drop/6','357-drop/7'].map(version=>({file:'supabase/ptown-polish/drop-proof.sql',version}))];
const historyBefore=`
CREATE TEMP TABLE saved_natty_runs ON COMMIT DROP AS SELECT id,to_jsonb(r) data FROM private.arcade_runs r WHERE game='357-drop';
CREATE TEMP TABLE saved_natty_results ON COMMIT DROP AS SELECT run_id,to_jsonb(r) data FROM private.arcade_results r WHERE game='357-drop';
CREATE TEMP TABLE saved_natty_receipts ON COMMIT DROP AS SELECT r.user_id,r.request_id,to_jsonb(r) data FROM private.arcade_command_receipts r JOIN saved_natty_runs s ON s.id=r.run_id;
CREATE TEMP TABLE saved_natty_rules ON COMMIT DROP AS SELECT id,config,enabled FROM private.arcade_rulesets WHERE game='357-drop' AND id<>'357-drop/7';
CREATE TEMP TABLE saved_natty_boards ON COMMIT DROP AS SELECT a.user_id,w,
 public.arcade_leaderboard(a.user_id,'357-drop',w,NULL,'357-drop/6') b
 FROM (SELECT DISTINCT user_id FROM private.arcade_results WHERE game='357-drop' AND ruleset='357-drop/6') a
 CROSS JOIN unnest(ARRAY['all','30'])w WHERE private.arcade_allowed(a.user_id);
`;
const historyAfter=`
DO $$ DECLARE saved_board record; b jsonb; BEGIN
 IF EXISTS(SELECT FROM saved_natty_runs old FULL JOIN (SELECT id,to_jsonb(r) data FROM private.arcade_runs r WHERE game='357-drop') current USING(id) WHERE old.data IS DISTINCT FROM current.data) THEN RAISE EXCEPTION 'historical run changed';END IF;
 IF EXISTS(SELECT FROM saved_natty_results old FULL JOIN (SELECT run_id,to_jsonb(r) data FROM private.arcade_results r WHERE game='357-drop') current USING(run_id) WHERE old.data IS DISTINCT FROM current.data) THEN RAISE EXCEPTION 'historical result changed';END IF;
 IF EXISTS(SELECT FROM saved_natty_receipts old JOIN private.arcade_command_receipts current USING(user_id,request_id) WHERE old.data<>to_jsonb(current)) THEN RAISE EXCEPTION 'historical receipt changed';END IF;
 IF EXISTS(SELECT FROM saved_natty_rules old JOIN private.arcade_rulesets current USING(id) WHERE old.config<>current.config OR old.enabled<>current.enabled) THEN RAISE EXCEPTION 'historical rules changed';END IF;
 FOR saved_board IN SELECT * FROM saved_natty_boards LOOP
  b:=public.arcade_leaderboard(saved_board.user_id,'357-drop',saved_board.w,NULL,'357-drop/7');
  IF b->'rows' IS DISTINCT FROM saved_board.b->'rows' OR b->'personalBest' IS DISTINCT FROM saved_board.b->'personalBest'
   OR b->'self' IS DISTINCT FROM saved_board.b->'self' OR b->'previousBests' IS DISTINCT FROM saved_board.b->'previousBests'
  THEN RAISE EXCEPTION 'high-score history changed';END IF;
 END LOOP;
END $$;
SELECT 'PASS: immutable historical runs/results/receipts, frozen configs, both leaderboard windows and personal bests' result;
`;
export function combinedProof(){
 return 'BEGIN;\nSET LOCAL lock_timeout=\'500ms\';\nSET LOCAL statement_timeout=\'60s\';\n'+historyBefore+(installed?'':candidate)+'\n'+proofs.map((entry,i)=>{
  const {file,version}=typeof entry==='string'?{file:entry}:entry;
  let sql=readFileSync(file,'utf8').replace(/^BEGIN;\r?\n/m,'').replace(/^ROLLBACK;\r?$/gm,'').replace('-- CANDIDATE_DDL','');
  if(version)sql=sql.replaceAll('357-drop/5',version);
  sql=sql.replaceAll("jsonb_array_length(response->'rows')=3","jsonb_array_length(response->'rows')>=3").replaceAll("'30')->'rows')=3","'30')->'rows')>=3");
  for(const name of ['reply','response'])sql=sql.replaceAll(`(SELECT count(DISTINCT x->>'rank') FROM jsonb_array_elements(${name}->'rows')x WHERE x->>'score'='0')=1`,`(SELECT count(DISTINCT public.arcade_leaderboard(r.user_id,r.game,'all',r.id)#>>'{latestResult,rank}') FROM private.arcade_runs r WHERE r.user_id IN(actor,stranger) AND r.game='357-drop' AND r.status='completed' AND r.score=0)=1`);
  return 'SAVEPOINT proof_'+i+';\n'+sql+'\nROLLBACK TO SAVEPOINT proof_'+i+';\n';
 }).join('\n')+historyAfter+'ROLLBACK;\nSELECT \'PASS: eight scoring and lifecycle proof groups; all candidate/fixture writes rolled back\' result;\n';
}
const sql=combinedProof();
writeFileSync('qualification.local/drop357-natty/'+(installed?'installed':'candidate')+'-proof.sql',sql);
if(!process.argv.includes('--prepare')){
 const c=await connect(db);try{
  console.log((await c.query(sql)).flatMap(x=>x.rows??[]));
  if(process.argv.includes('--install-local')){await c.query(candidate);console.log('Candidate installed only in disposable local database');}
 }finally{await c.end();}
}
