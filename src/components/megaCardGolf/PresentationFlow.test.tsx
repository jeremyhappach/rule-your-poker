// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MegaArcade} from './MegaArcade';
import {createRun,applyIntent,projectRun} from '@/lib/megaCardGolf/engine';
import {INITIAL_COURSES} from '@/lib/megaCardGolf/config';
import type {AudioManager} from '@/lib/audio/audioManager';
vi.mock('./MegaCardGolfGame',()=>({MegaCardGolfGame:(p:any)=><div data-testid="game" data-locked={p.presentation.locked}><span>Presented hole {p.view.hole}</span><button onClick={()=>p.onIntent({type:'replace',index:4})}>Replace last</button><button onClick={p.onExit}>Confirm abandon</button></div>}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();history.replaceState(null,'','/');});
async function advance(ms:number){for(let i=0;i<ms;i+=100)await act(async()=>{await vi.advanceTimersByTimeAsync(Math.min(100,ms-i));});}
function setup(){
 vi.useFakeTimers({toFake:['Date','performance','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame']});vi.setSystemTime(1000);
 vi.spyOn(document,'hidden','get').mockReturnValue(false);
 const config={...INITIAL_COURSES[0],holes:1};
 let run=applyIntent(createRun('r','u',config,[Array.from({length:52},(_,i)=>i)],1000),{type:'open',indices:[0,5]},1000);
 for(const index of [1,2,3])run=applyIntent(applyIntent(run,{type:'draw'},1000),{type:'replace',index},1000);
 run=applyIntent(run,{type:'draw'},1000);
 const request=vi.fn(async(body:any)=>{
  if(body.op==='catalog')return {courses:[config],boards:[],archives:[],active:run.status==='active'?run.id:null};
  if(body.op==='leaderboard')return {rows:[],self:null,personalBest:null};
  if(body.op==='action')run=applyIntent(run,body.intent,Date.now());
  return projectRun(run,Date.now());
 });
 const cue=vi.fn((_event:{id:string})=>vi.fn());history.replaceState(null,'','/?run=r');
 render(<MegaArcade request={request as any} userId="u" audio={{request:cue} as unknown as AudioManager}/>);
 return {request,cue,getRun:()=>run};
}
it('records completion immediately but holds game through replacement/counting; rapid inputs cannot submit more actions',async()=>{
 const fixture=setup();await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
 await act(async()=>{fireEvent.click(screen.getByText('Replace last'));});
 expect(fixture.getRun().status).toBe('completed');
 expect(screen.getByTestId('game').getAttribute('data-locked')).toBe('true');
 await act(async()=>{fireEvent.click(screen.getByText('Replace last'));});
 expect(fixture.request.mock.calls.filter(([b])=>b.op==='action')).toHaveLength(1);
 await advance(4400);
 expect(screen.getByTestId('game')).toBeTruthy();
 await advance(6500);
 expect(screen.queryByTestId('game')).toBeNull();expect(screen.getByRole('heading',{name:'Top Ten'})).toBeTruthy();
 const ids=fixture.cue.mock.calls.map(([cue])=>(cue as any).id);expect(new Set(ids).size).toBe(ids.length);expect(ids.some(id=>id.includes('/step/'))).toBe(true);
});
it('reuses the authoritative abandon action and exits only after its response',async()=>{
 const fixture=setup();await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
 await act(async()=>{fireEvent.click(screen.getByText('Confirm abandon'));});
 expect(fixture.getRun().status).toBe('abandoned');
 expect(fixture.request.mock.calls.filter(([b])=>b.op==='action').map(([b])=>b.intent)).toEqual([{type:'abandon'}]);
 expect(screen.queryByTestId('game')).toBeNull();expect(screen.queryByText(/Course complete/)).toBeNull();
});
it('finishes after a reconnect response that overlaps presentation completion',async()=>{
 const fixture=setup();await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
 await act(async()=>{fireEvent.click(screen.getByText('Replace last'));});
 let resolve!:(value:any)=>void;
 fixture.request.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}) as any);
 await act(async()=>{window.dispatchEvent(new Event('focus'));});
 await advance(11000);expect(screen.getByTestId('game')).toBeTruthy();
 await act(async()=>{resolve(projectRun(fixture.getRun(),Date.now()));});
 expect(screen.queryByTestId('game')).toBeNull();expect(screen.getByRole('heading',{name:'Top Ten'})).toBeTruthy();
});
