const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const { parseMetrics, summarize, counterDelta, delta, scrape, ENDPOINT } = require('./collector.cjs');

test('Prometheus parsing preserves escaped labels and scientific numbers, excluding absent values', () => {
  const samples = parseMetrics('# HELP ignored\na_metric{service_type="db",note="a\\\"b\\nend"} 1.2e+3\nmissing NaN\nother +Inf\nplain 0\n');
  assert.equal(samples.length, 2);
  assert.equal(samples[0].labels.note, 'a"b\nend');
  assert.equal(samples[0].value, 1200);
});
test('missing memory does not become zero or a reassuring free-memory estimate', () => {
  const summary = summarize([]);
  assert.equal(summary.usedExcludingCacheBytes, null);
  assert.equal(summary.swapUsedBytes, null);
  assert.equal(summary.pool.timeouts, null);
  assert.equal(summary.connections, null);
});
test('counter resets produce unknown deltas and never negative activity', () => {
  assert.equal(counterDelta(100, 4), null);
  assert.equal(counterDelta(null, 4), null);
  assert.equal(counterDelta(4, 9), 5);
  const before = { ...summarize([]), bootTimeSeconds: 10 };
  const after = { ...summarize([]), bootTimeSeconds: 20 };
  assert.deepEqual(delta(before, after, 60), { reset: true });
});
test('CPU, swap and disk changes use actual elapsed time including a capture gap', () => {
  const previous = { ...summarize([]), cpu: [{cpu:'0',mode:'idle',value:10},{cpu:'0',mode:'user',value:10},{cpu:'0',mode:'iowait',value:0}], swapInPages: 5, swapOutPages: 8, disks: [{name:'node_disk_read_bytes_total',labels:{device:'disk'},value:100}] };
  const current = { ...previous, cpu: [{cpu:'0',mode:'idle',value:100},{cpu:'0',mode:'user',value:34},{cpu:'0',mode:'iowait',value:6}], swapInPages: 9, swapOutPages: 10, disks: [{name:'node_disk_read_bytes_total',labels:{device:'disk'},value:340}] };
  const result = delta(previous, current, 120);
  assert.equal(result.cpuBusyPercent, 25);
  assert.equal(result.cpuIoWaitPercent, 5);
  assert.equal(result.swapInPages, 4);
  assert.equal(result.disks[0].perSecond, 2);
});
test('database reset invalidates deltas even when the new counter is already higher', () => {
  const previous = {...summarize([]), databaseCounters:[{name:'pg_stat_database_most_recent_reset',value:1},{name:'pg_stat_database_temp_bytes_total',value:4}]};
  const current = {...previous,databaseCounters:[{name:'pg_stat_database_most_recent_reset',value:2},{name:'pg_stat_database_temp_bytes_total',value:6}]};
  assert.equal(delta(previous,current,60).databaseCounters[0].change,null);
});
test('a redirect cannot forward the credential to another host', async t => {
  const destinations = [];
  t.mock.method(https, 'get', (url, options, callback) => {
    destinations.push(url);
    assert.ok(options.headers.Authorization.startsWith('Basic '));
    const request = new EventEmitter();
    queueMicrotask(() => callback({statusCode:302,headers:{location:'https://untrusted.invalid/metrics'},resume:()=>queueMicrotask(()=>request.emit('close'))}));
    return request;
  });
  await assert.rejects(scrape('sb_secret_fixture'), /http_302/);
  assert.deepEqual(destinations, [ENDPOINT]);
});
