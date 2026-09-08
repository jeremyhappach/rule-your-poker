import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
test('preparation does not switch jobs or replace gameplay',()=>{
  const sql=read('./recovery_runner_prepare.sql');
  assert.match(sql,/existing_tracking_override/);
  assert.match(sql,/ALTER ROLE postgres IN DATABASE postgres SET pg_stat_statements\.track='all'/);
  assert.doesNotMatch(sql,/cron\.alter_job|CREATE OR REPLACE FUNCTION|DELETE FROM|UPDATE public\./i);
});
for(const [name,command] of [['enable','CALL private.run_game_recovery_batch();'],['restore','SELECT private.advance_due_game_state();']]){
  test(`${name} changes only the canonical job after identity checks`,()=>{
    const sql=read(`./recovery_runner_${name}.sql`);
    assert.match(sql,/pg_advisory_xact_lock\(357357,20260820\)/);
    assert.match(sql,/INTO STRICT target FROM cron\.job WHERE jobname='advance-due-game-state-1s'/);
    assert.ok(sql.includes(`command:='${command}',active:=true`));
    assert.match(sql,/target\.schedule IS DISTINCT FROM '1 second'/);
    assert.match(sql,/BEGIN;\s+SET LOCAL lock_timeout='2s';/);
    assert.match(sql,/COMMIT;\s*$/);
    assert.doesNotMatch(sql,/cron\.(schedule|unschedule)\(|DELETE|UPDATE public\.|ALTER ROLE[^;]* SET |CREATE OR REPLACE FUNCTION/i);
  });
}
test('success and rollback both restore only the owned tracking override',()=>{
  for(const file of ['./recovery_runner_restore.sql','./recovery_runner_tracking_cleanup.sql']){
    assert.match(read(file),/ALTER ROLE postgres IN DATABASE postgres RESET pg_stat_statements\.track;/);
  }
  assert.match(read('./recovery_runner_tracking_cleanup.sql'),/unexpected_tracking_change/);
});
