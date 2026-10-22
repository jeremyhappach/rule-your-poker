import {expect,it} from 'vitest';
import {golfVisibleSubtotal,golfScoreBeats,golfScoreFrame} from './golfScoring';
import type {GolfSnapshot} from '@/lib/golf/model';
it('scores only visible values, cancels ranks not equal point values, preserves negatives',()=>{
 expect(golfVisibleSubtotal([1,null,null,null,null,null])).toBe(-2);
 expect(golfVisibleSubtotal([1,null,null,14,null,null])).toBe(0);
 expect(golfVisibleSubtotal([9,null,null,10,null,null])).toBe(20);
 expect(golfVisibleSubtotal([null,null,null,null,null,null])).toBe(0);
});
const v={phase:'hole_complete',scope:'r',viewerId:'a',players:[{id:'a',name:'A'},{id:'b',name:'B'}],tableaus:{a:{cards:[1,10,12,14,9,0]},b:{cards:[0,2,4,6,8,10]}},holes:[{roundId:'r',scores:{a:21,b:35}}],rules:{holeResultSeconds:16},deadline:16000} as unknown as GolfSnapshot;
it('counts opponents then self, holds each authoritative total for two seconds, and clears between',()=>{
 const beats=golfScoreBeats(v);expect(beats[0].playerId).toBe('b');expect(beats.filter(b=>b.kind==='total').map(b=>[b.text,b.duration])).toEqual([['B Final Score: +35',2000],['A Final Score: +21',2000]]);
 expect(beats.filter(b=>b.kind==='exit')).toHaveLength(2);expect(beats.find(b=>b.text==='Pair: +0')?.indices).toEqual([0,3]);
});
it('refuses concealed or unfinished scoring, and reconnect seeks results',()=>{
 expect(golfScoreBeats({...v,phase:'playing'})).toEqual([]);
 expect(golfScoreBeats({...v,tableaus:{...v.tableaus,a:{...v.tableaus.a,cards:[null,10,12,14,9,0]}}})).toEqual([]);
 expect(golfScoreFrame(v,200,true).results).toBe(true);
 expect(golfScoreFrame(v,16000,false).results).toBe(true);
 expect(golfScoreFrame(v,0,false).beat?.kind).toBe('intro');
});

it('accumulates this hole only, cancels a pair in one zero beat, and resets for each player',()=>{
 const sample={...v,scores:{a:999,b:888},tableaus:{...v.tableaus,b:{...v.tableaus.b,cards:[3,8,10,5,21,12]}},holes:[{hole:1,roundId:'r',scores:{a:21,b:20}}]};
 const beats=golfScoreBeats(sample);
 expect(beats.filter(x=>x.playerId==='b'&&x.kind==='card').map(x=>[x.text,x.subtotal])).toEqual([['4: +4',4],['6: +6',10],['Pair: +0',10],['J: +10',20],['K: +0',20]]);
 expect(beats.filter(x=>x.kind==='intro').map(x=>x.subtotal)).toEqual([0,0]);
 expect(beats.filter(x=>x.kind==='total').map(x=>x.subtotal)).toEqual([20,21]);
 const negative=golfScoreBeats({...v,tableaus:{...v.tableaus,b:{...v.tableaus.b,cards:[1,12,25,38,51,14]}}});
 expect(negative.find(x=>x.playerId==='b'&&x.kind==='card')?.subtotal).toBe(-2);
});

it('reveals the preserved hidden positions before counting at uncompressed configured intervals',()=>{
 const sample={...v,rules:{...v.rules,presentation:{version:1 as const,scoringDelayMs:1200,resultsDurationMs:5000}},presentation:{version:1 as const,startedAt:1000,resultsAt:0,endsAt:0,hidden:{b:[1,4],a:[]}}};
 const beats=golfScoreBeats(sample),own=beats.filter(x=>x.playerId==='b');expect(own.slice(0,4).map(x=>x.kind)).toEqual(['intro','reveal','reveal','card']);
 expect(own[0].hidden).toEqual([1,4]);expect(own[1].hidden).toEqual([1,4]);expect(own[2].hidden).toEqual([4]);expect(own[3].hidden).toEqual([]);
 expect(beats.filter(x=>x.kind==='reveal'||x.kind==='card').every(x=>x.duration===1200)).toBe(true);expect(own[1].subtotal).toBe(0);
 const natural=beats.reduce((a,b)=>a+b.duration,0);sample.presentation.resultsAt=1000+natural;sample.presentation.endsAt=6000+natural;
 expect(golfScoreFrame(sample,1700,false).beat?.kind).toBe('reveal');expect(golfScoreFrame(sample,2899,false).index).toBe(1);expect(golfScoreFrame(sample,2900,false).index).toBe(2);
 expect(golfScoreFrame(sample,sample.presentation.resultsAt-1,false).results).toBe(false);expect(golfScoreFrame(sample,sample.presentation.resultsAt,false).results).toBe(true);expect(golfScoreFrame(sample,sample.presentation.endsAt,false).results).toBe(false);
 expect(golfScoreFrame(sample,1700,true)).toMatchObject({beat:{kind:'reveal'},results:false,seeked:true});
});
