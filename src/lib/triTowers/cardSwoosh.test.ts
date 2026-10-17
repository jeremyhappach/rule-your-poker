import {expect,it,vi} from 'vitest';
import {triSwooshCueAt} from './cardSwoosh';
it('does not replay a delayed swoosh after audio unlock',()=>{
 expect(triSwooshCueAt(26,74).schedule({} as AudioContext,{} as AudioNode,n=>n)).toBe(false);
 expect(triSwooshCueAt(0,40).schedule({} as AudioContext,{} as AudioNode,n=>n)).toBe(false);
});
it('schedules one short filtered-noise sweep with a bounded envelope',()=>{
 const param=()=>({value:0,setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()});
 const source={buffer:null,connect:vi.fn(),start:vi.fn(),stop:vi.fn()},filter={type:'',Q:param(),frequency:param(),connect:vi.fn()},gain={gain:param(),connect:vi.fn()};
 const samples=new Float32Array(4704),context={currentTime:10,sampleRate:48000,createBuffer:vi.fn(()=>({getChannelData:()=>samples})),createBufferSource:()=>source,createBiquadFilter:()=>filter,createGain:()=>gain};
 const cue=triSwooshCueAt(0,100);expect(cue.durationMs).toBe(98);expect(cue.schedule(context as any,{} as AudioNode,n=>n)).toBe(true);
 expect(source.start).toHaveBeenCalledWith(10);expect(source.stop).toHaveBeenCalledWith(10.098);expect(filter.type).toBe('bandpass');expect(samples.some(n=>n!==0)).toBe(true);
});
