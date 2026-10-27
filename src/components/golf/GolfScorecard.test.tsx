// @vitest-environment jsdom
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
import {GolfScorecard,golfStandings,golfTotalLabel,golfPresentedScores} from './GolfScorecard';
afterEach(cleanup);
it.each([2,3,4])('separates Out, In and bold match Total for %i players',n=>{
 const players=Array.from({length:n},(_,i)=>({id:String(i),name:'Player '+i}));
 const v={rules:{holes:18},phase:'complete',players,holes:Array.from({length:18},(_,i)=>({hole:i+1,scores:Object.fromEntries(players.map((p,j)=>[p.id,(i<9?1:2)+j]))})),scores:{'0':999}} as unknown as GolfSnapshot;
 render(<GolfScorecard snapshot={v}/>);
 const tables=document.querySelectorAll('.golf-scorecard table');
 expect([...tables].map(t=>t.querySelector('caption')?.textContent)).toEqual(['Front Nine','Back Nine']);
 expect([...tables[0].querySelectorAll('thead th')].map(t=>t.textContent)).toEqual(['Player','1','2','3','4','5','6','7','8','9','Out']);
 expect([...tables[1].querySelectorAll('thead th')].map(t=>t.textContent)).toEqual(['Player','10','11','12','13','14','15','16','17','18','In','Total']);
 for(let j=0;j<n;j++){
  expect(document.querySelector('[data-golf-subtotal=out][data-golf-player="'+j+'"]')?.textContent).toBe('+'+(9+9*j));
  expect(document.querySelector('[data-golf-subtotal=in][data-golf-player="'+j+'"]')?.textContent).toBe('+'+(18+9*j));
  expect(document.querySelector('[data-golf-total="'+j+'"]')?.textContent).toBe('+'+(27+18*j));
 }
 expect(document.querySelectorAll('.golf-match-total')).toHaveLength(n+1);
 expect(document.querySelectorAll('.golf-match-total .golf-pencil-score')).toHaveLength(n);
});
it.each([0,3,9,11])('uses only %i completed holes for partial nine subtotals',completed=>{
 const v={rules:{holes:18},phase:'playing',players:[{id:'p',name:'You'}],holes:Array.from({length:completed},(_,i)=>({hole:i+1,scores:{p:i<9?-2:4}})),scores:{p:999},tableaus:{p:{cards:[51,50,49,48,47,46]}}} as unknown as GolfSnapshot;
 render(<GolfScorecard snapshot={v}/>);
 const label=(n:number)=>n===0?'E':n>0?'+'+n:String(n);
 const out=-2*Math.min(completed,9),inside=4*Math.max(0,completed-9);
 expect(document.querySelector('[data-golf-subtotal=out]')?.textContent).toBe(label(out));
 expect(document.querySelector('[data-golf-subtotal=in]')?.textContent).toBe(label(inside));
 expect(document.querySelector('[data-golf-total]')?.textContent).toBe(label(out+inside));
 expect([...document.querySelectorAll('tbody [data-golf-hole]')].slice(completed).every(td=>td.textContent==='')).toBe(true);
});
it('holds the ninth-hole contribution out of Out and match Total until pencil writing finishes',()=>{
 const v={id:'d',scope:'r9',rules:{holes:18},phase:'hole_complete',players:[{id:'p',name:'You'}],holes:Array.from({length:9},(_,i)=>({hole:i+1,scores:{p:1}}))} as unknown as GolfSnapshot;
 render(<GolfScorecard snapshot={v} writeHole={9}/>);
 const values=()=>[document.querySelector('[data-golf-subtotal=out]'),document.querySelector('[data-golf-subtotal=in]'),document.querySelector('[data-golf-total]')].map(e=>e?.textContent);
 expect(values()).toEqual(['+8','E','+8']);
 const e=new Event('webkitAnimationEnd',{bubbles:true});Object.defineProperty(e,'animationName',{value:'golf-write-score'});fireEvent(document.querySelector('[data-golf-write]')!,e);
 expect(values()).toEqual(['+9','E','+9']);
});
it.each([3,6,9,18] as const)('shows every completed result for %i holes with nine-column sections',count=>{
 const v={id:'d',scope:'last',phase:'complete',rules:{holes:count},players:[{id:'p',name:'You'},{id:'q',name:'Peer'}],holes:Array.from({length:count},(_,i)=>({hole:i+1,roundId:i===count-1?'last':'r'+i,scores:{p:i-2,q:3}}))} as unknown as GolfSnapshot;
 render(<GolfScorecard snapshot={v}/>);
 expect(golfStandings(v)[0].holes).toHaveLength(count);
 const tables=[...document.querySelectorAll('.golf-scorecard table')];
 expect(tables).toHaveLength(Math.ceil(count/9));
 expect(tables.flatMap(t=>[...t.querySelectorAll('thead [data-golf-hole]')].map(e=>e.textContent))).toEqual(Array.from({length:count},(_,i)=>String(i+1)));
 expect(tables.flatMap(t=>[...t.querySelectorAll('tbody tr:first-child [data-golf-hole]')].map(e=>e.textContent))).toEqual(Array.from({length:count},(_,i)=>i===2?'E':i>2?'+'+(i-2):String(i-2)));
 if(count===18){expect(screen.getByText('Front Nine')).toBeTruthy();expect(screen.getByText('Back Nine')).toBeTruthy();}else expect(screen.getAllByText(/Final scores/)).toHaveLength(1);
});
it('writes hole 18 once, holds In and Total, and leaves Out unchanged',()=>{
 const v={id:'d',scope:'r18',phase:'complete',rules:{holes:18},players:[{id:'p',name:'You'}],holes:Array.from({length:18},(_,i)=>({hole:i+1,scores:{p:1}}))} as unknown as GolfSnapshot;
 const done=vi.fn();render(<GolfScorecard snapshot={v} writeHole={18} onRowWritten={done}/>);
 expect([...document.querySelectorAll('[data-golf-total]')].map(e=>e.textContent)).toEqual(['+17']);expect(document.querySelector('[data-golf-subtotal=out]')?.textContent).toBe('+9');expect(document.querySelector('[data-golf-subtotal=in]')?.textContent).toBe('+8');
 const cells=document.querySelectorAll('[data-golf-write]');expect(cells).toHaveLength(1);
 const e=new Event('webkitAnimationEnd',{bubbles:true});Object.defineProperty(e,'animationName',{value:'golf-write-score'});fireEvent(cells[0],e);fireEvent(cells[0],e);
 expect(done).toHaveBeenCalledTimes(1);expect([...document.querySelectorAll('[data-golf-total]')].map(e=>e.textContent)).toEqual(['+18']);expect(document.querySelector('[data-golf-subtotal=out]')?.textContent).toBe('+9');expect(document.querySelector('[data-golf-subtotal=in]')?.textContent).toBe('+9');
});
it.each([2,3,4])('renders %i players with nine holes and completed results only',n=>{
 const players=Array.from({length:n},(_,i)=>({id:String(i),name:'Player'+i}));
 const v={players,holes:[{hole:1,scores:Object.fromEntries(players.map(p=>[p.id,0]))},{hole:2,scores:{'0':-2}}],scores:{'0':999},phase:'playing',tableaus:{'0':{cards:[51,50,49,48,47,46]}}} as unknown as GolfSnapshot;
 const rows=golfStandings(v);expect(rows[0].total).toBe(-2);expect(rows[0].thru).toBe(2);expect(rows[0].holes.slice(2)).toEqual(Array(7).fill(undefined));
 expect(golfTotalLabel(0,0)).toBe('E');expect(golfTotalLabel(0,1)).toBe('E');
 render(<GolfScorecard snapshot={v}/>);expect(screen.getAllByRole('row')).toHaveLength(n+1);expect(screen.getAllByRole('columnheader')).toHaveLength(11);expect(screen.queryByText('999')).toBeNull();
});

it('releases each total only after its own pencil completion and dedupes repeated path events',()=>{
 const v={id:'d',scope:'r2',phase:'hole_complete',players:[{id:'p',name:'You'},{id:'q',name:'Peer'}],holes:[{hole:1,roundId:'r1',scores:{p:25,q:10}},{hole:2,roundId:'r2',scores:{p:7,q:-2}}]} as unknown as GolfSnapshot;
 const complete=vi.fn();const ui=render(<GolfScorecard snapshot={v} writeHole={2} onRowWritten={complete}/>);
 const total=(id:string)=>document.querySelector('[data-golf-total="'+id+'"]')!.textContent;
 expect(total('p')).toBe('+25');expect(total('q')).toBe('+10');
 const paths=document.querySelectorAll('[data-golf-write]');
 const end=(el:Element)=>{const e=new Event('webkitAnimationEnd',{bubbles:true});Object.defineProperty(e,'animationName',{value:'golf-write-score'});fireEvent(el,e);};
 end(paths[0]);
 expect(total('p')).toBe('+32');expect(total('q')).toBe('+10');
 end(paths[0]);expect(complete).toHaveBeenCalledTimes(1);
 end(paths[1]);expect(total('q')).toBe('+8');expect(complete).toHaveBeenCalledTimes(2);
 ui.rerender(<GolfScorecard snapshot={{...v}} writeHole={2} onRowWritten={complete}/>);expect(total('p')).toBe('+32');expect(complete).toHaveBeenCalledTimes(2);
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

it('formats positive, even and negative holes and totals while leaving unplayed holes blank',()=>{
 const v={phase:'playing',players:[{id:'p',name:'You'}],holes:[{hole:1,scores:{p:4}},{hole:2,scores:{p:0}},{hole:3,scores:{p:-2}}],scores:{p:999},tableaus:{p:{cards:[null,null,null,null,null,null]}}} as unknown as GolfSnapshot;
 render(<GolfScorecard snapshot={v}/>);
 const cells=[...document.querySelectorAll('tbody td')];expect(cells.map(c=>c.textContent)).toEqual(['+4','E','-2','','','','','','','+2']);
 expect([...cells[0].querySelectorAll('path')].every(p=>!!p.getAttribute('d'))).toBe(true);
 expect(golfTotalLabel(2,3)).toBe('+2');expect(golfTotalLabel(-2,3)).toBe('-2');
 expect(screen.queryByRole('img',{name:'999'})).toBeNull();
});
