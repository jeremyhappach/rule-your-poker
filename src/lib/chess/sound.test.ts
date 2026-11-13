import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const cues=vi.hoisted(()=>({tri:{durationMs:180,schedule:vi.fn(()=>true)},bust:{durationMs:1020,schedule:vi.fn(()=>true)}}));
vi.mock('@/lib/audio/approvedSounds',()=>({approvedSound:(n:string)=>n==='triInvalid'?cues.tri:n==='run21Bust'?cues.bust:undefined}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{getSnapshot:()=>({userId:'viewer'}),present:vi.fn()}}));
import {platformAudio} from '@/lib/audio/platformAudio';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('document',{hidden:false});vi.stubGlobal('matchMedia',()=>({matches:false}));});afterEach(()=>vi.unstubAllGlobals());
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>true}));
import {chessSlideCue,chessSound} from './sound';
import {chessSamples,chessMotion} from './presentation';
it('keeps slide output at 45% and schedules the soft slide at the animation start',()=>{
 const copy=vi.fn(),start=vi.fn(),connect=vi.fn(),gain={gain:{value:1},connect:vi.fn()},source={buffer:null,connect,start};
 const context={currentTime:12,createGain:()=>gain,createBuffer:()=>({copyToChannel:copy}),createBufferSource:()=>source};
 const destination={} as AudioNode,tracked:unknown[]=[];
 expect(chessSlideCue.schedule(context as unknown as AudioContext,destination,(n:any)=>{tracked.push(n);return n;})).toBe(true);
 expect(gain.gain.value).toBe(.45);expect(gain.connect).toHaveBeenCalledWith(destination);expect(connect).toHaveBeenCalledWith(gain);
 expect(copy.mock.calls[0][0]).toEqual(chessSamples('slide').samples);expect(start).toHaveBeenCalledWith(12,0,chessMotion.slide/1000);expect(chessSlideCue.durationMs).toBe(chessMotion.slide);expect(tracked).toEqual([gain,source]);
});

it('uses the selected Run21 bust recording and exact TriTowers invalid cue through the shared mixer',()=>{
 chessSound('move-1','poof',null);const capture=vi.mocked(platformAudio.present).mock.calls[0][0].cue!;expect(capture.durationMs).toBe(1020);const context={} as AudioContext,destination={} as AudioNode,track=(n:any)=>n;expect(capture.schedule(context,destination,track)).toBe(true);expect(cues.bust.schedule).toHaveBeenCalledWith(context,destination,track);
 chessSound('attempt-1','invalid',null);expect(vi.mocked(platformAudio.present).mock.calls[1][0].cue).toBe(cues.tri);
});
it('does not schedule either reused cue under reduced motion',()=>{vi.stubGlobal('matchMedia',()=>({matches:true}));chessSound('move-1','poof',null);chessSound('attempt-1','invalid',null);expect(platformAudio.present).not.toHaveBeenCalled();});
