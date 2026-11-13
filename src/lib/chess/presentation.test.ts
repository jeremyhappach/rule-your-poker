import {it,expect} from 'vitest';
import {chessSamples,chessMotion,chessAudio} from './presentation';
const rms=(a:Float32Array,from:number,to:number)=>{const s=a.slice(Math.round(from*48000),Math.round(to*48000));return Math.sqrt(s.reduce((n,v)=>n+v*v,0)/s.length);};
const peak=(a:Float32Array)=>a.reduce((m,n)=>Math.max(m,Math.abs(n)),0);
it('retains soft friction across visible slide travel without a leading pitched hit',()=>{
 const {samples}=chessSamples('slide');expect(samples.length).toBe(chessMotion.slide*48);
 expect(rms(samples,0,.035)).toBeLessThan(rms(samples,.12,.22)*.15);
 expect(rms(samples,.1,.2)).toBeGreaterThan(.015);
 expect(rms(samples,.22,.3)).toBeGreaterThan(.01);
 expect(rms(samples,.33,.36)).toBeLessThan(rms(samples,.12,.22)*.15);
});
it('keeps the quieter knight lift, airborne slide and landing distinct',()=>{
 const {samples}=chessSamples('hop');expect(samples.length).toBe(chessMotion.hop*48);
 expect(peak(samples)).toBeCloseTo(.06,5);
 expect(rms(samples,.02,.1)).toBeGreaterThan(.012);
 expect(rms(samples,.12,.15)).toBe(0);
 expect(rms(samples,.155,.2)).toBeGreaterThan(.004);
 expect(rms(samples,.27,.38)).toBe(0);
 expect(rms(samples,.39,.43)).toBeGreaterThan(.012);
 expect(rms(samples,.39,.43)).toBeGreaterThan(rms(samples,.155,.2));
});
it('lets the crumble settle quietly while its final dust remains visible',()=>{
 const {samples}=chessSamples('poof');expect(samples.length).toBe(chessMotion.poof*48);
 for(const t of [.04,.2,.4])expect(rms(samples,t,t+.05)).toBeGreaterThan(.006);
 expect(rms(samples,.6,.65)).toBeLessThan(rms(samples,.3,.35));
 expect(rms(samples,chessAudio.crumbleEnd,.8)).toBe(0);
 expect(chessMotion.poof/1000-chessAudio.crumbleEnd).toBeCloseTo(.14);
 expect(peak(samples)).toBeCloseTo(.065,5);
 expect(samples.every(n=>Number.isFinite(n)&&Math.abs(n)<.4)).toBe(true);
});
