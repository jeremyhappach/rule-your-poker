import {it,expect} from 'vitest';
import {chessSamples,chessMotion} from './presentation';
const rms=(a:Float32Array,from:number,to:number)=>{const s=a.slice(Math.round(from*48000),Math.round(to*48000));return Math.sqrt(s.reduce((n,v)=>n+v*v,0)/s.length);};
it('sustains slide friction across travel without an initial impact',()=>{
 const {samples}=chessSamples('slide');expect(samples.length).toBe(chessMotion.slide*48);
 for(const t of [.02,.1,.2,.29])expect(rms(samples,t,t+.03)).toBeGreaterThan(.012);
 expect(rms(samples,0,.008)).toBeLessThan(rms(samples,.1,.108));expect(Math.abs(samples.at(-1)!)).toBeLessThan(.001);
});
it('has audible lift and landing separated by a quiet airborne interval',()=>{
 const {samples}=chessSamples('hop');expect(samples.length).toBe(chessMotion.hop*48);
 expect(rms(samples,.04,.16)).toBeGreaterThan(.012);expect(rms(samples,.24,.34)).toBe(0);
 expect(rms(samples,.39,.43)).toBeGreaterThan(.012);
});
it('sustains a textured crumble through the visible breakup and fades out without clipping',()=>{
 const {samples}=chessSamples('poof');expect(samples.length).toBe(chessMotion.poof*48);
 for(const t of [.04,.2,.4,.6])expect(rms(samples,t,t+.05)).toBeGreaterThan(.006);
 expect(rms(samples,.75,.8)).toBeLessThan(rms(samples,.3,.35));expect(samples.every(n=>Number.isFinite(n)&&Math.abs(n)<.4)).toBe(true);
});
