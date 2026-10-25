import {describe,it,expect} from 'vitest';
import {CANASTA_GEOMETRY_DEFAULTS as defaults,sanitizeCanastaGeometry,fanLayout,canastaFeltRects} from './geometry';
import {intersects} from '@/lib/run21/safeFelt';
describe('Canasta bounded presentation geometry',()=>{
 it('retains a tappable summary beside piles in the measured short-landscape shell',()=>{
  const height=135.46875,reserved=[{x:0,y:12/height,width:1,height:17.671875/height},
   {x:177.93/300,y:8.125/height,width:40/300,height:40/height},
   {x:175.93/300,y:66.125/height,width:44/300,height:32/height}];
  const result=canastaFeltRects(reserved,300,height,defaults);
  expect(result.summary.width*300).toBeGreaterThan(59);expect(result.summary.height*height).toBeGreaterThanOrEqual(44);
  expect(result.piles.width).toBeGreaterThan(0);
 });
 it('clamps corrupt or aggressive settings without changing the default object',()=>{
  expect(sanitizeCanastaGeometry(null)).toEqual(defaults);
  expect(sanitizeCanastaGeometry({cardWidth:1,handOverlap:1,meldOverlap:NaN,pileBottom:2})).toMatchObject({cardWidth:44,handOverlap:.14,meldOverlap:.14,pileBottom:.97});
 });
 it('packs fans without shrinking cards or exposing less than 44px of interactive targets',()=>{
  for(const available of [260,365,480])for(const count of [2,15,30,71])for(const width of [44,48,72]){
   const f=fanLayout(available,count,width,.14,true);expect(f.step).toBeGreaterThanOrEqual(44);expect(f.width).toBe(width);
   expect(f.width+(f.columns-1)*f.step).toBeLessThanOrEqual(available);
  }
 });
 it('keeps summary and pile rectangles inside the felt and clear of shell seats',()=>{
  const reserved=[{x:.77,y:.05,width:.2,height:.3},{x:.35,y:.03,width:.3,height:.08}];
  for(const [width,height] of [[360,330],[300,215],[700,220]]){
   const {summary,piles}=canastaFeltRects(reserved,width,height,defaults);
   expect(piles.width).toBeGreaterThan(0);expect(summary.width).toBeGreaterThan(0);expect(intersects(summary,piles)).toBe(false);
   for(const r of [summary,piles]){
    expect(reserved.some(o=>intersects(r,o))).toBe(false);
    for(const x of [r.x,r.x+r.width])for(const y of [r.y,r.y+r.height])expect((2*x-1)**2+(2*y-1)**2).toBeLessThanOrEqual(.985);
   }
  }
 });
});
