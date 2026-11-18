// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {fiveAlivePoof,fiveAliveBink,fiveAliveInvalid,fiveAliveSuccess,fiveAliveCountCue} from './fiveAliveAudio';
const cues=[fiveAliveInvalid,fiveAlivePoof,fiveAliveBink,...Object.values(fiveAliveSuccess),fiveAliveCountCue(0,700)];
afterEach(()=>{vi.useRealTimers();sessionStorage.clear();});
it('has distinct original phrases, stepped celebrations, and a relieved sixth solve',()=>{
 expect(new Set(cues).size).toBe(cues.length);
 expect([1,2,3,4,5].map(n=>fiveAliveSuccess[n].durationMs)).toEqual([1900,1350,740,560,450]);
 expect(fiveAliveSuccess[6].durationMs).toBe(800);
});
it.each(cues.map((cue,i)=>({cue,i})))('plays cue $i once and consumes muted receipts without catch-up',async({cue,i})=>{
 vi.useFakeTimers();const h=audioHarness();
 try{
  await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const event={userId:'user',id:'five-alive:test:'+i,expiresAt:Date.now()+2500,cue};
  h.manager.setPreference('user',false);h.manager.request(event);expect(h.starts()).toHaveLength(0);
  h.manager.setPreference('user',true);h.manager.request(event);expect(h.starts()).toHaveLength(0);
  h.manager.request({...event,id:event.id+':fresh'});const count=h.starts().length;expect(count).toBeGreaterThan(0);
  h.manager.request({...event,id:event.id+':fresh'});expect(h.starts()).toHaveLength(count);
  h.manager.setPreference('user',false);expect(h.nodes.filter(n=>n.kind==='oscillator').every(n=>n.stop.mock.calls.length===2)).toBe(true);
 }finally{h.dispose();}
});
