import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IntervalJob, delayAfterTick, batchTimeline } from './recovery_runner_model.mjs';

test('one launch starts immediately', () => {
  const job = new IntervalJob();
  assert.equal(job.poll(0), true);
  assert.equal(job.launches, 1);
});
test('running interval job queues at most one rerun', () => {
  const job = new IntervalJob();
  job.poll(0);
  for (let now=1000;now<=600_000;now+=1000) assert.equal(job.poll(now), false);
  assert.equal(job.pending, 1);
  assert.equal(job.launches, 1);
});
test('normal bounded completion admits queued replacement', () => {
  const job = new IntervalJob();
  job.poll(0); job.poll(1000); job.finish();
  assert.equal(job.poll(32_000), true);
  assert.equal(job.pending, 0);
});
test('failure after first interval admits replacement without minute wait', () => {
  const job = new IntervalJob();
  job.poll(0); job.poll(1000); job.finish();
  assert.equal(job.poll(3500), true);
});
test('failure before interval waits for original interval', () => {
  const job = new IntervalJob();
  job.poll(0); job.finish();
  assert.equal(job.poll(200), false);
  assert.equal(job.poll(1000), true);
});
test('no parallel launch even with repeated polls', () => {
  const job = new IntervalJob();
  job.poll(0);
  for (const now of [1,1000,2000,32_000]) assert.equal(job.poll(now), false);
});
test('capacity exhaustion cannot be claimed as prompt restart', () => {
  const job = new IntervalJob();
  assert.equal(job.poll(0,false), false);
  assert.equal(job.pending, 1);
  assert.equal(job.poll(1000,true), true);
});
test('inactive jobs cannot launch', () => {
  const job = new IntervalJob();
  job.active = false;
  assert.equal(job.poll(0), false);
  assert.equal(job.pending, 0);
});
test('disabling after completion prevents queued replacement', () => {
  const job = new IntervalJob();
  job.poll(0); job.poll(1000); job.finish(); job.active=false;
  assert.equal(job.poll(2000), false);
});
test('normal work uses only remaining second for sleep', () => {
  assert.equal(delayAfterTick(0,40),960);
});
test('overrun does not add another second of delay', () => {
  assert.equal(delayAfterTick(0,1800),0);
});
test('overrun reanchors next tick instead of catch-up bursts', () => {
  const ticks=batchTimeline([40,1800,40,40]);
  assert.deepEqual(ticks.map(t=>t.start),[0,1000,2800,3800]);
});
test('last tick sleeps to avoid a fast duplicate at batch boundary', () => {
  const ticks=batchTimeline(Array(32).fill(40));
  assert.equal(ticks.at(-1).start,31_000);
  assert.equal(ticks.at(-1).nextStart,32_000);
});
test('32 tick batches need one invocation rather than 32 in the ideal model', () => {
  const job=new IntervalJob();
  for (let now=0;now<=64_000;now+=1000) {
    if (now>0&&now%32_000===0) job.finish();
    job.poll(now);
  }
  assert.equal(job.launches,3);
  assert.ok(job.pending<=1);
});
const sql=readFileSync(new URL('./recovery_runner_commit_probe.sql',import.meta.url),'utf8');
test('SQL proof contains no production cron command or gameplay mutation call', () => {
  assert.doesNotMatch(sql,/cron\.(?:schedule|alter_job|unschedule)\s*\(/i);
  assert.doesNotMatch(sql,/private\.advance_due_game_state\s*\(/i);
  assert.doesNotMatch(sql,/(?:INSERT INTO|UPDATE|DELETE FROM|DROP TABLE)\s+(?:public|private)\./i);
});
test('proof procedure is invoker without a procedure SET clause', () => {
  assert.match(sql,/LANGUAGE plpgsql SECURITY INVOKER\s+AS/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});
test('interruption fixture can target only its own backend', () => {
  const cancel=readFileSync(new URL('./recovery_runner_cancel_probe.sql',import.meta.url),'utf8');
  assert.match(cancel,/pg_cancel_backend\(pg_catalog\.pg_backend_pid\(\)\)/);
  assert.doesNotMatch(cancel,/pg_terminate_backend/);
});
