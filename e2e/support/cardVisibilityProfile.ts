import type { Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

/** Test-only sampling; nothing is injected into the production bundle. */
export async function profileCardVisibility(page: Page, info: TestInfo) {
  await page.bringToFront();
  const cdp = await page.context().newCDPSession(page);
  let diagnosticRequests = 0;
  const request = (r: import('@playwright/test').Request) => {
    if (r.method() === 'POST' && r.url().includes('/rest/v1/debug_events') && r.postData()?.includes('card-visibility-invariant')) diagnosticRequests++;
  };
  page.on('request', request);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const longTasks = await page.evaluate(async () => {
    const tasks: number[] = [];
    const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => e.duration)));
    observer.observe({ entryTypes: ['longtask'] });
    for (let i = 0; i < 40; i++) {
      document.querySelector<HTMLButtonElement>(`[data-canonical-shell-tabbar] [aria-label="${i % 2 ? 'Cards' : 'Chat'}"]`)!.click();
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    }
    await new Promise(r => setTimeout(r, 300));
    observer.disconnect(); return tasks;
  });
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach(); page.off('request', request);
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(info.outputPath('holm-hud.cpuprofile'), JSON.stringify(profile));
  const maps = new Map<string, TraceMap>();
  const owners = new Map<number, string>();
  for (const node of profile.nodes) {
    const frame = node.callFrame;
    if (!frame.url.startsWith('http://127.0.0.1:4793/assets/')) { owners.set(node.id, frame.functionName || '(browser)'); continue; }
    const file = path.join('dist/assets', path.basename(new URL(frame.url).pathname) + '.map');
    if (!fs.existsSync(file)) throw new Error(`Profile requires local-only source map: ${file}`);
    if (!maps.has(file)) maps.set(file, new TraceMap(JSON.parse(fs.readFileSync(file, 'utf8'))));
    const source = originalPositionFor(maps.get(file)!, { line: frame.lineNumber + 1, column: frame.columnNumber });
    owners.set(node.id, source.source ?? frame.functionName);
  }
  const ownMs: Record<string, number> = {};
  const parents = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const diagnosticTree = new Set<number>();
  for (const node of profile.nodes) {
    let id: number | undefined = node.id;
    while (id !== undefined) {
      if (/cardVisibility|CardVisibility/.test(owners.get(id) ?? '')) { diagnosticTree.add(node.id); break; }
      id = parents.get(id);
    }
  }
  let diagnosticSampledTotalMs = 0;
  profile.samples?.forEach((id, i) => { const owner = owners.get(id) ?? '(unknown)'; ownMs[owner] = (ownMs[owner] ?? 0) + (profile.timeDeltas?.[i] ?? 0) / 1000; });
  profile.samples?.forEach((id, i) => { if (diagnosticTree.has(id)) diagnosticSampledTotalMs += (profile.timeDeltas?.[i] ?? 0) / 1000; });
  const sources = Object.entries(ownMs).sort((a,b) => b[1] - a[1]);
  const diagnostic = sources.filter(([name]) => /cardVisibility|CardVisibility/.test(name));
  return { durationMs: (profile.endTime - profile.startTime) / 1000, longTasks, diagnosticRequests,
    diagnosticSampledSelfMs: diagnostic.reduce((sum, [, ms]) => sum + ms, 0), diagnosticSampledTotalMs, diagnostic, topSources: sources.slice(0, 12) };
}
