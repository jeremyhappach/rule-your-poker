import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('./recovery_runner_candidate.sql',import.meta.url),'utf8');
const body=sql.match(/AS \$procedure\$([\s\S]+)\$procedure\$/)?.[1];
test('candidate is an invoker procedure without a procedure SET clause',()=>{
  assert.match(sql,/LANGUAGE plpgsql\s+SECURITY INVOKER\s+AS/);
});
test('candidate has one fixed canonical target and 32 ticks',()=>{
  assert.match(body,/FOR v_tick IN 1\.\.32 LOOP/);
  assert.equal((body.match(/PERFORM private\.advance_due_game_state\(\)/g)||[]).length,1);
  assert.doesNotMatch(body,/\bEXECUTE\b|\bEXCEPTION\s+WHEN/i);
});
test('work commits before sleep and sleep commits before loop continuation',()=>{
  assert.match(body,/advance_due_game_state\(\);\s+COMMIT;/);
  assert.equal((body.match(/\bCOMMIT;/g)||[]).length,2);
  assert.match(body,/COMMIT;\s+END LOOP;/);
});
test('candidate neither changes cron nor overrides timeout or game authority',()=>{
  assert.doesNotMatch(body,/cron\.(schedule|alter_job|unschedule)|set_config|statement_timeout|INSERT|UPDATE|DELETE/i);
});
test('each tick checks exact active job command before calling the dispatcher',()=>{
  assert.match(body,/FROM cron\.job[\s\S]+jobname = 'advance-due-game-state-1s'[\s\S]+username = current_user[\s\S]+database = pg_catalog\.current_database\(\)[\s\S]+AND active[\s\S]+command = 'CALL private\.run_game_recovery_batch\(\);'[\s\S]+RETURN;[\s\S]+PERFORM private\.advance_due_game_state/);
});
test('execute is denied to API roles and granted to scheduled postgres invoker',()=>{
  assert.match(sql,/REVOKE ALL ON PROCEDURE private\.run_game_recovery_batch\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(sql,/GRANT EXECUTE ON PROCEDURE private\.run_game_recovery_batch\(\) TO postgres;/);
});
test('fixture cannot silently overwrite an existing dispatcher',()=>{
  const fixture=readFileSync(new URL('./recovery_runner_branch_fixture.sql',import.meta.url),'utf8');
  assert.match(fixture,/to_regprocedure\('private\.advance_due_game_state\(\)'\) IS NOT NULL/);
  assert.doesNotMatch(fixture,/CREATE OR REPLACE FUNCTION private\.advance_due_game_state/);
});
