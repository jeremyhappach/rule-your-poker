// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {fixtureMatch,PLAYERS} from './fixtures';
import {project} from './engine';
afterEach(()=>{sessionStorage.clear();delete window.__RUN21_TIMINGS__;vi.resetModules();});
it('correlates realtime-first DOM/paint evidence to its acknowledged command and keeps capture bounded',async()=>{
 sessionStorage.setItem('run21-timing','1');const d=await import('./diagnostics'),view=project(fixtureMatch(),PLAYERS[0].id),key=JSON.stringify([view.identity,view.roundId,view.viewerId])+':'+view.boards[view.viewerId!]!.revision;
 d.run21Timing('confirmed-dom',key);d.run21Timing('confirmed-paint-opportunity',key);d.run21SnapshotTiming('request-1',view,3);
 expect(window.__RUN21_TIMINGS__!.slice(0,2).map(s=>s.id)).toEqual(['request-1','request-1']);expect(d.run21ConfirmationId(key)).toBe('request-1');
 for(let i=0;i<2500;i++)d.run21Timing('sample',String(i));expect(window.__RUN21_TIMINGS__).toHaveLength(2400);
});
it('does not retain timings when diagnostics are disabled',async()=>{
 sessionStorage.setItem('run21-timing','0');const d=await import('./diagnostics');d.run21Timing('intent','request');expect(window.__RUN21_TIMINGS__).toBeUndefined();
});
