// Database-only benchmark analysis. Milliseconds are elapsed work, not CPU.
export function summarizeTicks(ticks) {
  if (!ticks.length) throw new Error('No committed ticks');
  const sorted = [...ticks].sort((a,b) => Date.parse(a.completed_at)-Date.parse(b.completed_at));
  if (new Set(sorted.map(t => String(t.xid))).size !== sorted.length) {
    throw new Error('Ticks reused a transaction');
  }
  const durations = sorted.map(t => t.duration_ms).sort((a,b)=>a-b);
  if (durations.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid duration');
  const percentile = p => {
    const i = (durations.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
    return durations[lo]+(durations[hi]-durations[lo])*(i-lo);
  };
  const starts=sorted.map(t=>Date.parse(t.completed_at)-t.duration_ms);
  const gaps=starts.slice(1).map((v,i)=>v-starts[i]);
  return {
    ticks: sorted.length, backends: new Set(sorted.map(t=>t.pid)).size,
    mean_ms: durations.reduce((a,b)=>a+b,0)/durations.length,
    p50_ms: percentile(.5), p95_ms: percentile(.95), max_ms: durations.at(-1),
    min_start_gap_ms: gaps.length ? Math.min(...gaps) : null,
    max_start_gap_ms: gaps.length ? Math.max(...gaps) : null,
    failures: sorted.filter(t=>t.outcome!=='completed').length
  };
}
export function compareWindows(baseline,candidate,{minimumTicks}={}) {
  const a=summarizeTicks(baseline),b=summarizeTicks(candidate);
  if (!Number.isInteger(minimumTicks)||minimumTicks<1) throw new Error('Explicit sample minimum required');
  if (a.ticks<minimumTicks||b.ticks<minimumTicks) throw new Error('Incomplete benchmark window');
  if (a.failures||b.failures) throw new Error('Failed ticks cannot qualify savings');
  if (a.mean_ms===0) throw new Error('Zero-duration baseline cannot establish savings');
  return {baseline:a,candidate:b,
    work_reduction_percent:100*(1-b.mean_ms/a.mean_ms),
    backend_reduction_percent:100*(1-(b.backends/b.ticks)/(a.backends/a.ticks))};
}
export function counterDelta(before,after,fields) {
  if (before.stats_reset !== after.stats_reset) throw new Error('Counters reset');
  return Object.fromEntries(fields.map(field=>{
    const a=Number(before[field]),b=Number(after[field]);
    if (!Number.isFinite(a)||!Number.isFinite(b)||b<a) throw new Error('Invalid counter delta');
    return [field,b-a];
  }));
}
