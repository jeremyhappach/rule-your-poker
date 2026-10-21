// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';import {audioHarness} from '../audio/audioTestHarness';import {racePokerCue} from './audio';
it.each([true,false])('original cues respect the canonical sound preference (%s)',async(enabled)=>{
 vi.useFakeTimers();sessionStorage.clear();const h=audioHarness(async()=>enabled);try{await Promise.resolve();await Promise.resolve();await Promise.resolve();h.manager.unlock();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 for(const kind of ['card','hoof','warning','victory'] as const)h.manager.request({userId:'user',id:'race-test:'+kind,expiresAt:Date.now()+2000,cue:racePokerCue(kind)});
 expect(h.starts().length).toBe(enabled?13:0);
 }finally{h.dispose();vi.useRealTimers();}
});
