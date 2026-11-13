import {it,expect,vi} from 'vitest';
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{}}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>true}));
import {chessSlideCue} from './sound';
import {chessSamples,chessMotion} from './presentation';
it('reduces only slide output to 45% while preserving the approved samples and timing',()=>{
 const copy=vi.fn(),start=vi.fn(),connect=vi.fn(),gain={gain:{value:1},connect:vi.fn()},source={buffer:null,connect,start};
 const context={currentTime:12,createGain:()=>gain,createBuffer:()=>({copyToChannel:copy}),createBufferSource:()=>source};
 const destination={} as AudioNode,tracked:unknown[]=[];
 expect(chessSlideCue.schedule(context as unknown as AudioContext,destination,(n:any)=>{tracked.push(n);return n;})).toBe(true);
 expect(gain.gain.value).toBe(.45);expect(gain.connect).toHaveBeenCalledWith(destination);expect(connect).toHaveBeenCalledWith(gain);
 expect(copy.mock.calls[0][0]).toEqual(chessSamples('slide').samples);expect(start).toHaveBeenCalledWith(12,0,chessMotion.slide/1000);expect(chessSlideCue.durationMs).toBe(chessMotion.slide);expect(tracked).toEqual([gain,source]);
});
