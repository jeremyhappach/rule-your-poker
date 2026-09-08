import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTicks,compareWindows,counterDelta} from './recovery_workload_analyze.mjs';
const ticks=(ms,pids)=>pids.map((pid,i)=>({completed_at:new Date(i*1000+ms).toISOString(),duration_ms:ms,pid,xid:String(i+1),outcome:'completed'}));
test('normalizes work and backends per committed tick',()=>{
  const r=compareWindows(ticks(40,[1,2,3,4]),ticks(5,[5,5,5,5]),{minimumTicks:4});
  assert.equal(r.work_reduction_percent,87.5);assert.equal(r.backend_reduction_percent,75);
  assert.equal(r.candidate.min_start_gap_ms,1000);
});
test('rejects missing ticks',()=>assert.throws(()=>summarizeTicks([])));
test('rejects transaction reuse',()=>{const t=ticks(1,[1,1]);t[1].xid=t[0].xid;assert.throws(()=>summarizeTicks(t));});
test('one tick has no cadence claim',()=>assert.equal(summarizeTicks(ticks(1,[1])).max_start_gap_ms,null));
test('reports failed outcomes',()=>{const t=ticks(1,[1]);t[0].outcome='partial_failure';assert.equal(summarizeTicks(t).failures,1);});
test('does not infer savings from a zero baseline',()=>assert.throws(()=>compareWindows(ticks(0,[1]),ticks(0,[2]),{minimumTicks:1})));
test('failed ticks cannot qualify savings',()=>{const t=ticks(1,[1]);t[0].outcome='partial_failure';assert.throws(()=>compareWindows(ticks(5,[2]),t,{minimumTicks:1}));});
test('requires an explicit fulfilled sample minimum',()=>{
  assert.throws(()=>compareWindows(ticks(5,[1]),ticks(1,[2])));
  assert.throws(()=>compareWindows(ticks(5,[1]),ticks(1,[2]),{minimumTicks:2}));
});
test('counters require matching reset epoch and monotonic totals',()=>{
  assert.deepEqual(counterDelta({stats_reset:'a',sessions:10},{stats_reset:'a',sessions:12},['sessions']),{sessions:2});
  assert.throws(()=>counterDelta({stats_reset:'a',sessions:10},{stats_reset:'b',sessions:12},['sessions']));
  assert.throws(()=>counterDelta({stats_reset:'a',sessions:10},{stats_reset:'a',sessions:9},['sessions']));
});
