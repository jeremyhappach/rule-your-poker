// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
import {GolfScorecard,golfStandings,golfTotalLabel} from './GolfScorecard';
afterEach(cleanup);
it.each([2,3,4])('renders %i players with nine holes and completed results only',n=>{
 const players=Array.from({length:n},(_,i)=>({id:String(i),name:'Player'+i}));
 const v={players,holes:[{hole:1,scores:Object.fromEntries(players.map(p=>[p.id,0]))},{hole:2,scores:{'0':-2}}],scores:{'0':999},phase:'playing',tableaus:{'0':{cards:[51,50,49,48,47,46]}}} as unknown as GolfSnapshot;
 const rows=golfStandings(v);expect(rows[0].total).toBe(-2);expect(rows[0].thru).toBe(2);expect(rows[0].holes.slice(2)).toEqual(Array(7).fill(undefined));
 expect(golfTotalLabel(0,0)).toBe('—');expect(golfTotalLabel(0,1)).toBe('E');
 render(<GolfScorecard snapshot={v}/>);expect(screen.getAllByRole('row')).toHaveLength(n+1);expect(screen.getAllByRole('columnheader')).toHaveLength(11);expect(screen.queryByText('999')).toBeNull();
});
