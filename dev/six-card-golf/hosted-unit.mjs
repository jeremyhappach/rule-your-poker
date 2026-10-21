// One connector request, one implicit repeatable-read transaction. Prerequisites
// and temporary baseline capture run as original top-level statements. Only the
// candidate rehearsal and its assertions occupy the rollback subtransaction.
// Candidate bytes and all fixture/assertion statements remain unchanged. An
// intentional subtransaction rollback retains PL/pgSQL evidence variables,
// then the original residual checks run before one combined result is returned.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function wrapUnit(sql,{legacy=false}={}){
 const begin='BEGIN ISOLATION LEVEL REPEATABLE READ;';
 assert.equal(sql.split(begin).length,2);
 assert.equal(sql.split('\nROLLBACK;').length,2);
 const [before,after]=sql.split('\nROLLBACK;');
 const original=before.slice(before.indexOf(begin)+begin.length);
 const marker='-- golf-proof:rehearsal-start';
 if(!legacy)assert.equal(original.split(marker).length,2,'Explicit preparation/rehearsal boundary required');
 const boundary=legacy?0:original.indexOf(marker);
 const setup=original.slice(0,boundary),body=original.slice(boundary);
 assert(!body.includes('$golf_unit$')&&!after.includes('$golf_residual$'));
 assert(!/\b(?:COMMIT|ROLLBACK)\s*;/i.test(body));
 return `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s';
${setup}
CREATE TEMP TABLE golf_hosted_capture(candidate_evidence jsonb,rollback_evidence jsonb) ON COMMIT DROP;
DO $golf_capture$ DECLARE a jsonb;b jsonb;BEGIN
 BEGIN
  EXECUTE $golf_unit$${body}$golf_unit$ INTO a;
  IF a IS NULL THEN RAISE EXCEPTION 'golf_proof:missing_candidate_evidence';END IF;
  RAISE EXCEPTION SQLSTATE 'P0G01' USING MESSAGE='golf_proof:intentional_unit_rollback';
 EXCEPTION WHEN SQLSTATE 'P0G01' THEN NULL;
 END;
 EXECUTE $golf_residual$${after}$golf_residual$ INTO b;
 IF b IS NULL THEN RAISE EXCEPTION 'golf_proof:missing_rollback_evidence';END IF;
 INSERT INTO pg_temp.golf_hosted_capture VALUES(a,b);
END $golf_capture$;
${legacy?'':`DROP FUNCTION IF EXISTS pg_temp.golf_fixture_uuid();
DROP FUNCTION IF EXISTS pg_temp.golf_unchanged();
DROP SEQUENCE IF EXISTS pg_temp.golf_fixture_ids;`}
SELECT * FROM pg_temp.golf_hosted_capture;
`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=process.argv[2];assert(dir,'Pass generated candidate/installed directory');
 const manifest=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
 assert.equal(manifest.units.length,16,'Complete sixteen-unit matrix required');
 const out=dir+'/mcp';mkdirSync(out,{recursive:true});
 const units=manifest.units.map(u=>{
  const source=readFileSync(dir+'/'+u.name+'.sql','utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),u.sha256);
  const sql=wrapUnit(source);writeFileSync(out+'/'+u.name+'.sql',sql);
  return {...u,source_sha256:u.sha256,sha256:createHash('sha256').update(sql).digest('hex')};
 });
 writeFileSync(out+'/manifest.json',JSON.stringify({...manifest,transport:'MCP top-level preparation; same-transaction rehearsal rollback',units},null,2));
 console.log('Prepared '+units.length+' single-request rollback wrappers; no database connection.');
}
