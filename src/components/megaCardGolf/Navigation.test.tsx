// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MegaArcade} from './MegaArcade';
import {CourseClubhouse} from './CourseClubhouse';
import {CourseSelection} from './CourseSelection';
import {MegaLeaderboard} from './MegaLeaderboard';
import {INITIAL_COURSES} from '@/lib/megaCardGolf/config';
import {createRun,projectRun} from '@/lib/megaCardGolf/engine';
import type {AudioManager} from '@/lib/audio/audioManager';
vi.mock('./MegaCardGolfGame',()=>({MegaCardGolfGame:()=> <div>Active game</div>}));
const audio={} as AudioManager;
const catalog={courses:INITIAL_COURSES,boards:[],archives:[],active:null,admission:true,isAdmin:true};
const row=(score:number,name='Birdie')=>({runId:name,name,score,rank:1});
afterEach(()=>{cleanup();vi.restoreAllMocks();history.replaceState(null,'','/');});
it('opens each course without starting; only Start Game admits a run and Return to Clubhouse restores selection',async()=>{
 const request=vi.fn(async(body:any)=>body.op==='catalog'?catalog:body.op==='leaderboard'?{rows:[row(-8)],self:null,personalBest:null}:projectRun(createRun('run','owner',INITIAL_COURSES[0],Array.from({length:9},()=>Array.from({length:52},(_,i)=>i)),Date.now()),Date.now()));
 const back=vi.fn();render(<MegaArcade request={request as any} userId="owner" audio={audio} onBack={back}/>);
 await screen.findByRole('heading',{name:'Select a Course'});expect(screen.queryByRole('button',{name:'Defaults'})).toBeNull();expect(screen.queryByRole('button',{name:'Start Game'})).toBeNull();
 for(const course of INITIAL_COURSES){
  fireEvent.click(screen.getByRole('button',{name:'Select '+course.name}));await screen.findByRole('heading',{name:'Top Ten'});
  expect(request.mock.calls.filter(([b])=>b.op==='start')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Return to Clubhouse'}));await screen.findByRole('heading',{name:'Select a Course'});await waitFor(()=>expect(screen.getByRole('button',{name:'Select '+course.name}).hasAttribute('disabled')).toBe(false));
 }
 fireEvent.click(screen.getByRole('button',{name:'Back to Arcade'}));expect(back).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Select Sunny Meadows'}));fireEvent.click(screen.getByRole('button',{name:'Start Game'}));await screen.findByText('Active game');
 expect(request.mock.calls.filter(([b])=>b.op==='start')).toEqual([[expect.objectContaining({courseId:'sunny-meadows',requestId:expect.any(String)})]]);
});
it('reads all-time records from the exact active board and never substitutes sample records',async()=>{
 const request=vi.fn(async(body:any)=>({rows:body.courseId==='sunny-meadows'?[row(0)]:[]}));
 render(<CourseSelection courses={INITIAL_COURSES} request={request as any} onSelect={vi.fn()} busy={false}/>);
 await screen.findByText('Course record: E');expect(screen.getAllByText('Course record: —')).toHaveLength(2);
 for(const course of INITIAL_COURSES)expect(request).toHaveBeenCalledWith({op:'leaderboard',courseId:course.id,boardId:course.boardId,window:'all'});
});
it('does not let a late prior-board response replace the new course record',async()=>{
 let resolveOld!:(value:any)=>void;const old=new Promise(resolve=>{resolveOld=resolve;});
 const request=vi.fn(async(body:any)=>body.boardId==='old'?old:{rows:[row(-3)]});
 const course={...INITIAL_COURSES[0],boardId:'old'};
 const ui=render(<CourseSelection courses={[course]} request={request as any} onSelect={vi.fn()} busy={false}/>);
 ui.rerender(<CourseSelection courses={[{...course,boardId:'new'}]} request={request as any} onSelect={vi.fn()} busy={false}/>);
 await screen.findByText('Course record: -3');resolveOld({rows:[row(-99)]});await new Promise(r=>setTimeout(r,0));
 expect(screen.queryByText('Course record: -99')).toBeNull();
});
it('preserves server order/tied ranks and requests both periods with exact board isolation',async()=>{
 const request=vi.fn(async()=>({rows:[row(-8,'B'),row(-8,'A')],self:null,personalBest:-8}));
 render(<MegaLeaderboard course="coastal-links" boardId="board-2" request={request as any}/>);
 await screen.findByText('B');expect([...document.querySelectorAll('tbody tr')].map(e=>e.textContent)).toEqual(['1B-8','1A-8']);
 fireEvent.click(screen.getByRole('button',{name:'All Time'}));
 await waitFor(()=>expect(request).toHaveBeenLastCalledWith({op:'leaderboard',courseId:'coastal-links',boardId:'board-2',window:'all'}));
 expect(request).toHaveBeenCalledWith({op:'leaderboard',courseId:'coastal-links',boardId:'board-2',window:'30'});
});
it('keeps disabled admission browseable but cannot start',async()=>{
 const request=vi.fn(async(body:any)=>body.op==='catalog'?{...catalog,admission:false}:{rows:[],self:null,personalBest:null});
 render(<MegaArcade request={request as any} userId="owner" audio={audio}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Select Sunny Meadows'}));
 const start=await screen.findByRole('button',{name:'Course unavailable'});expect(start.hasAttribute('disabled')).toBe(true);fireEvent.click(start);expect(request.mock.calls.some(([b])=>b.op==='start')).toBe(false);
});

it('keeps selection free of play controls and resumes the existing run from the course screen',async()=>{
 const state=projectRun(createRun('existing-run','owner',INITIAL_COURSES[0],Array.from({length:9},()=>Array.from({length:52},(_,i)=>i)),Date.now()),Date.now());
 const request=vi.fn(async(body:any)=>body.op==='catalog'?{...catalog,active:'existing-run'}:body.op==='state'?state:{rows:[],self:null,personalBest:null});
 render(<MegaArcade request={request as any} userId="owner" audio={audio}/>);
 await screen.findByRole('heading',{name:'Select a Course'});expect(screen.queryByRole('button',{name:'Resume course'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Select Sunny Meadows'}));fireEvent.click(await screen.findByRole('button',{name:'Resume course'}));await screen.findByText('Active game');
 expect(request).toHaveBeenCalledWith({op:'state',runId:'existing-run'});expect(request.mock.calls.some(([b])=>b.op==='start')).toBe(false);
});

it.each([[7,'+7'],[0,'E'],[-4,'-4'],[null,'—']] as const)('formats course record %s as %s without changing its value',async(score,label)=>{
 const request=vi.fn(async()=>({rows:score===null?[]:[row(score)]}));
 render(<CourseSelection courses={[INITIAL_COURSES[0]]} request={request as any} onSelect={vi.fn()} busy={false}/>);
 await screen.findByText('Course record: '+label);
});
it('keeps failed and loading records distinct from even par',async()=>{
 let reject!:(error:Error)=>void;
 const request=vi.fn(()=>new Promise((_resolve,fail)=>{reject=fail;}));
 render(<CourseSelection courses={[INITIAL_COURSES[0]]} request={request as any} onSelect={vi.fn()} busy={false}/>);
 expect(screen.getByText('Course record: Loading…')).toBeTruthy();
 reject(Error('Board unavailable'));await screen.findByText('Course record: Unavailable');
 expect(screen.queryByText('Course record: E')).toBeNull();
});

it.each([[0,'discards'],[1,'discard'],[3,'discards']] as const)('uses configured %s %s per hole on tiles and course screens',async(count,noun)=>{
 const course={...INITIAL_COURSES[2],discardAllowance:count};
 const request=vi.fn(async()=>({rows:[],self:null,personalBest:null}));
 render(<><CourseSelection courses={[course]} request={request as any} onSelect={vi.fn()} busy={false}/><CourseClubhouse course={course} archives={[]} request={request as any} busy={false} canStart onStart={vi.fn()} onReturn={vi.fn()}/></>);
 await screen.findByText('Course record: —');
 expect(document.querySelector('.mega-tile-limits')?.textContent).toContain(count+' '+noun+' per hole');
 expect(document.querySelector('.mega-course-heading p')?.textContent).toContain(count+' '+noun+' per hole');
});
