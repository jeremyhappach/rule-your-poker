'use strict';
// Local only: never import into the app or publish credentials/collected data.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const PROJECT = 'xvhmbuppghwmwpwrkzao';
const ENDPOINT = `https://${PROJECT}.supabase.co/customer/v1/privileged/metrics`;
const ROOT = path.join(process.env.LOCALAPPDATA || '', 'PTownPoker', 'metrics');
const INTERVAL_MS = 60_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function parseMetrics(text) {
  const metrics = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\S+)?$/.exec(line);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;
    const labels = {};
    for (const label of (match[2] || '').matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g)) {
      labels[label[1]] = label[2].replace(/\\([\\"n])/g, (_, c) => c === 'n' ? '\n' : c);
    }
    metrics.push({ name: match[1], labels, value });
  }
  return metrics;
}

function summarize(metrics) {
  const find = (name, labels = {}) => metrics.find(m => m.name === name && Object.entries(labels).every(([k, v]) => m.labels[k] === v))?.value ?? null;
  const all = name => metrics.filter(m => m.name === name);
  const memory = Object.fromEntries(metrics.filter(m => m.name.startsWith('node_memory_')).map(m => [m.name.slice(12), m.value]));
  const minus = (...values) => values.every(Number.isFinite) ? values.slice(1).reduce((a, b) => a - b, values[0]) : null;
  return {
    memory,
    // MemAvailable already estimates reclaimable memory; do not subtract cache again.
    usedExcludingCacheBytes: minus(find('node_memory_MemTotal_bytes'), find('node_memory_MemFree_bytes'), find('node_memory_Buffers_bytes'), find('node_memory_Cached_bytes')),
    swapUsedBytes: minus(find('node_memory_SwapTotal_bytes'), find('node_memory_SwapFree_bytes')),
    swapInPages: find('node_vmstat_pswpin'), swapOutPages: find('node_vmstat_pswpout'),
    bootTimeSeconds: find('node_boot_time_seconds'),
    cpu: all('node_cpu_seconds_total').map(m => ({ cpu: m.labels.cpu, mode: m.labels.mode, value: m.value })),
    disks: metrics.filter(m => /^node_disk_(read_bytes|written_bytes|reads_completed|writes_completed|io_time_seconds|io_now)/.test(m.name)),
    connections: find('pg_stat_database_num_backends'),
    pool: {
      available: find('pgrst_db_pool_available'), maximum: find('pgrst_db_pool_max'),
      waiting: find('pgrst_db_pool_waiting'), timeouts: find('pgrst_db_pool_timeouts_total'),
    },
    databaseCounters: metrics.filter(m => /^pg_stat_database_(temp_|blks_|xact_|deadlocks|most_recent_reset)/.test(m.name)),
    queryCalls: find('pg_stat_statements_total_queries'), querySeconds: find('pg_stat_statements_total_time_seconds'),
    reportedProcessRss: all('process_resident_memory_bytes').map(m => ({ service: m.labels.service_type, bytes: m.value })),
    // A postgresql label can identify the exporter process, not the sum of database backends.
    processRssCaution: 'Reported exporter/service RSS; not a complete per-backend RAM breakdown.',
    metricFamilies: new Set(metrics.map(m => m.name)).size,
  };
}

function counterDelta(before, after) {
  return Number.isFinite(before) && Number.isFinite(after) && after >= before ? after - before : null;
}

function delta(previous, current, elapsedSeconds) {
  if (!previous || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return null;
  if (previous.bootTimeSeconds !== current.bootTimeSeconds) return { reset: true };
  const cpuDeltas = current.cpu.map(m => ({ ...m, change: counterDelta(previous.cpu.find(p => p.cpu === m.cpu && p.mode === m.mode)?.value, m.value) }));
  const validCpu = cpuDeltas.length > 0 && cpuDeltas.every(m => m.change !== null);
  const total = validCpu ? cpuDeltas.reduce((a, m) => a + m.change, 0) : 0;
  const idle = cpuDeltas.filter(m => m.mode === 'idle').reduce((a, m) => a + m.change, 0);
  const io = cpuDeltas.filter(m => m.mode === 'iowait').reduce((a, m) => a + m.change, 0);
  const databaseReset = previous.databaseCounters?.find(m => m.name === 'pg_stat_database_most_recent_reset')?.value !== current.databaseCounters?.find(m => m.name === 'pg_stat_database_most_recent_reset')?.value;
  const databaseCounters = (current.databaseCounters || []).filter(m => m.name.endsWith('_total')).map(m => ({ name: m.name, change: databaseReset ? null : counterDelta(previous.databaseCounters?.find(p => p.name === m.name)?.value, m.value) }));
  const disks = (current.disks || []).filter(m => m.name.endsWith('_total')).map(m => {
    const change = counterDelta(previous.disks?.find(p => p.name === m.name && p.labels.device === m.labels.device)?.value, m.value);
    return { name: m.name, device: m.labels.device, change, perSecond: change === null ? null : change / elapsedSeconds };
  });
  return {
    elapsedSeconds,
    cpuBusyPercent: total > 0 ? 100 * (total - idle) / total : null,
    cpuIoWaitPercent: total > 0 ? 100 * io / total : null,
    swapInPages: counterDelta(previous.swapInPages, current.swapInPages),
    swapOutPages: counterDelta(previous.swapOutPages, current.swapOutPages),
    poolTimeouts: counterDelta(previous.pool.timeouts, current.pool.timeouts),
    queryCalls: counterDelta(previous.queryCalls, current.queryCalls),
    querySeconds: counterDelta(previous.querySeconds, current.querySeconds),
    databaseCounters, disks,
  };
}

function readKey() {
  // ConvertFrom-SecureString's default Windows format is a DPAPI-protected hex
  // blob. Use .NET directly so the helper does not depend on module auto-loading.
  const script = "$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::LoadWithPartialName('System.Security'); $f=[IO.Path]::Combine($env:LOCALAPPDATA,'PTownPoker','metrics','access.dpapi'); $h=[IO.File]::ReadAllText($f).Trim(); $b=[byte[]]::new($h.Length/2); for($i=0;$i -lt $b.Length;$i++){$b[$i]=[Convert]::ToByte($h.Substring($i*2,2),16)}; $p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); try {[Console]::Write([Text.Encoding]::Unicode.GetString($p))} finally {[Array]::Clear($p,0,$p.Length)}";
  let key;
  try {
    key = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { throw new Error('credential_unavailable'); }
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) throw new Error('credential_invalid');
  return key;
}

function scrape(key) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const request = https.get(ENDPOINT, {
      headers: {
        Authorization: `Basic ${Buffer.from(`username:${key}`).toString('base64')}`,
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'PTownPoker-local-metrics/1.0',
      },
    }, response => {
      // Never follow redirects with the credential, and never log response error bodies.
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`http_${response.statusCode}`));
        return;
      }
      const chunks = [];
      let wireBytes = 0;
      response.on('data', chunk => {
        wireBytes += chunk.length;
        if (wireBytes > MAX_BODY_BYTES) { request.destroy(new Error('response_too_large')); return; }
        chunks.push(chunk);
      });
      response.on('error', () => reject(new Error('response_error')));
      response.on('end', () => {
        try {
          const raw = Buffer.concat(chunks);
          const encoding = response.headers['content-encoding'] || 'identity';
          const decoded = encoding === 'gzip' ? zlib.gunzipSync(raw, { maxOutputLength: MAX_BODY_BYTES }) : encoding === 'deflate' ? zlib.inflateSync(raw, { maxOutputLength: MAX_BODY_BYTES }) : raw;
          const text = decoded.toString('utf8');
          const metrics = parseMetrics(text);
          if (!metrics.some(m => m.name === 'node_memory_MemTotal_bytes' && m.value > 0 && m.labels.supabase_project_ref === PROJECT)) throw new Error('invalid_metrics');
          resolve({ text, metrics, wireBytes, decodedBytes: decoded.length, encoding, durationMs: Date.now() - start });
        } catch { reject(new Error('invalid_metrics')); }
      });
    });
    const deadline = setTimeout(() => request.destroy(new Error('timeout')), 20_000);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', error => reject(new Error(['timeout', 'response_too_large'].includes(error.message) ? error.message : 'network_error')));
  });
}

function atomicJson(file, value) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run(until) {
  if (!process.env.LOCALAPPDATA) throw new Error('localappdata_missing');
  const deadline = Date.parse(until);
  if (!Number.isFinite(deadline) || deadline <= Date.now() || deadline > Date.now() + 7 * 86400_000) throw new Error('invalid_deadline');
  const key = readKey();
  const lockPath = path.join(ROOT, 'collector.lock');
  let lock;
  try { lock = fs.openSync(lockPath, 'wx'); } catch { throw new Error('collector_lock_exists'); }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, until }));
  const stopPath = path.join(ROOT, 'stop.request');
  if (fs.existsSync(stopPath)) fs.unlinkSync(stopPath);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'captures', runId);
  fs.mkdirSync(dir, { recursive: true });
  const statusPath = path.join(ROOT, 'status.json');
  const state = { project: PROJECT, pid: process.pid, runId, captureDirectory: dir, startedAt: new Date().toISOString(), until, intervalSeconds: 60, successfulSamples: 0, failedSamples: 0, wireBytes: 0, status: 'running' };
  atomicJson(statusPath, state);
  let previous = null, previousAt = null, errors = 0, stop = false;
  process.on('SIGTERM', () => { stop = true; });
  process.on('SIGINT', () => { stop = true; });
  try {
    while (!stop && Date.now() < deadline && !fs.existsSync(stopPath)) {
      const iteration = Date.now();
      try {
        const result = await scrape(key);
        const now = Date.now();
        const summary = summarize(result.metrics);
        const row = { timestamp: new Date(now).toISOString(), wireBytes: result.wireBytes, decodedBytes: result.decodedBytes, encoding: result.encoding, requestDurationMs: result.durationMs, summary, delta: delta(previous, summary, (now - previousAt) / 1000) };
        const snapshotFile = `${String(state.successfulSamples + 1).padStart(5, '0')}.prom.gz`;
        fs.writeFileSync(path.join(dir, snapshotFile), zlib.gzipSync(result.text));
        row.snapshotFile = snapshotFile;
        fs.appendFileSync(path.join(dir, 'samples.jsonl'), JSON.stringify(row) + '\n');
        previous = summary; previousAt = now; errors = 0;
        state.successfulSamples++; state.wireBytes += result.wireBytes;
        state.lastSuccessAt = row.timestamp; state.latest = summary; state.lastDelta = row.delta;
        delete state.lastError;
      } catch (error) {
        errors++; state.failedSamples++;
        state.lastError = { at: new Date().toISOString(), code: error.message };
        fs.appendFileSync(path.join(dir, 'errors.jsonl'), JSON.stringify(state.lastError) + '\n');
        if (/^http_(401|403)$/.test(error.message)) { state.stopReason = 'authentication_failed'; break; }
        if (errors >= 5) { state.stopReason = 'five_consecutive_failures'; break; }
      }
      atomicJson(statusPath, state);
      // No overlap, no catch-up burst after sleep, and no retries within the minute.
      const next = Math.max(iteration + INTERVAL_MS, Date.now());
      while (!stop && Date.now() < Math.min(next, deadline) && !fs.existsSync(stopPath)) await sleep(Math.min(2000, next - Date.now(), deadline - Date.now()));
    }
    state.stopReason ||= Date.now() >= deadline ? 'deadline' : 'stop_requested';
  } catch {
    state.stopReason = 'collector_error';
  } finally {
    state.status = ['authentication_failed', 'five_consecutive_failures', 'collector_error'].includes(state.stopReason) ? 'failed' : 'stopped';
    state.stoppedAt = new Date().toISOString();
    atomicJson(statusPath, state);
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'probe') {
    const result = await scrape(readKey());
    const report = { at: new Date().toISOString(), project: PROJECT, wireBytes: result.wireBytes, decodedBytes: result.decodedBytes, encoding: result.encoding, durationMs: result.durationMs, summary: summarize(result.metrics) };
    atomicJson(path.join(ROOT, 'probe.json'), report);
    console.log(JSON.stringify(report, null, 2));
  } else if (command === 'run') {
    await run(process.argv[3]);
  } else if (command === 'stop') {
    fs.writeFileSync(path.join(ROOT, 'stop.request'), new Date().toISOString());
    console.log('Stop requested; the collector finishes its current read and stops.');
  } else if (command === 'status') {
    const status = readJson(path.join(ROOT, 'status.json'));
    if (status?.status === 'running') {
      try { process.kill(status.pid, 0); } catch { status.status = 'not_running'; }
      status.sampleAgeSeconds = status.lastSuccessAt ? (Date.now() - Date.parse(status.lastSuccessAt)) / 1000 : null;
    }
    console.log(JSON.stringify(status || { status: 'not_started' }, null, 2));
  } else throw new Error('Use probe, run <UTC-deadline>, status, or stop.');
}

module.exports = { parseMetrics, summarize, counterDelta, delta, scrape, ENDPOINT };
if (require.main === module) main().catch(error => { console.error(`Collector: ${error.message}`); process.exitCode = 1; });
