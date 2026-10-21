// Historical MCP transport, retained for local diagnosis/reproduction only.
// Its enclosing DO statement imposes a whole-unit deadline. Use direct-proof.mjs
// for a later authorized hosted attempt; do not generate new hosted wrappers.
// Candidate bytes and all fixture/assertion statements remain unchanged. An
// intentional subtransaction rollback retains PL/pgSQL evidence variables,
// then the original residual checks run before one combined result is returned.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function wrapUnit(sql){
 const begin='BEGIN ISOLATION LEVEL REPEATABLE READ;';
 assert.equal(sql.split(begin).length,2);
 assert.equal(sql.split('\nROLLBACK;').length,2);
 const [before,after]=sql.split('\nROLLBACK;');
 const body=before.slice(before.indexOf(begin)+begin.length);
 assert(!body.includes('$golf_unit$')&&!after.includes('$golf_residual$'));
 assert(!/\b(?:COMMIT|ROLLBACK)\s*;/i.test(body));
 return `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s';
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
SELECT * FROM pg_temp.golf_hosted_capture;
`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 throw Error('MCP wrapper retired: use direct-proof.mjs with an approved direct/session connection');
}
