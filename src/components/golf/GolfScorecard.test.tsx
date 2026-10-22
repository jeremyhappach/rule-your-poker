// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
import {GolfScorecard,golfStandings,golfTotalLabel,golfPresentedScores} from './GolfScorecard';
afterEach(cleanup);
it.each([2,3,4])('renders %i players with nine holes and completed results only',n=>{
 const players=Array.from({length:n},(_,i)=>({id:String(i),name:'Player'+i}));
 const v={players,holes:[{hole:1,scores:Object.fromEntries(players.map(p=>[p.id,0]))},{hole:2,scores:{'0':-2}}],scores:{'0':999},phase:'playing',tableaus:{'0':{cards:[51,50,49,48,47,46]}}} as unknown as GolfSnapshot;
 const rows=golfStandings(v);expect(rows[0].total).toBe(-2);expect(rows[0].thru).toBe(2);expect(rows[0].holes.slice(2)).toEqual(Array(7).fill(undefined));
 expect(golfTotalLabel(0,0)).toBe('—');expect(golfTotalLabel(0,1)).toBe('E');
 render(<GolfScorecard snapshot={v}/>);expect(screen.getAllByRole('row')).toHaveLength(n+1);expect(screen.getAllByRole('columnheader')).toHaveLength(11);expect(screen.queryByText('999')).toBeNull();
});
it.each(['hole_complete','complete'])('withholds only the uncounted hole from every score projection in %s',phase=>{
 const v={phase,scope:'round-2',players:[{id:'p',name:'You'},{id:'q',name:'Other'}],holes:[{hole:1,roundId:'round-1',scores:{p:4,q:6}},{hole:2,roundId:'round-2',scores:{p:-2,q:9}}],scores:{p:2,q:15}} as unknown as GolfSnapshot;
 const held=golfPresentedScores(v,false);
 expect(held.scores).toEqual({p:4,q:6});expect(golfStandings(held).map(p=>p.thru)).toEqual([1,1]);
 expect(held.holes.map(h=>h.hole)).toEqual([1]);expect(v.holes).toHaveLength(2);
 expect(golfPresentedScores(v,true)).toBe(v);
});
it('writes only the newly completed hole, with normalized pencil strokes and time for the hold',()=>{
 const v={phase:'hole_complete',players:[{id:'p',name:'You'}],rules:{presentation:{resultsDurationMs:5000}},holes:[{hole:1,scores:{p:4}},{hole:2,scores:{p:-2}}]} as unknown as GolfSnapshot;
 render(<GolfScorecard snapshot={v} writeHole={2}/>);
 expect(document.querySelectorAll('[data-golf-write]')).toHaveLength(1);
 expect(document.querySelector('[data-golf-write]')?.textContent).toBe('-2');
 expect(document.querySelector('.golf-scorecard')?.getAttribute('style')).toContain('3000ms');
 expect([...document.querySelectorAll('[data-golf-write] path')].every(p=>p.getAttribute('pathLength')==='1')).toBe(true);
});
