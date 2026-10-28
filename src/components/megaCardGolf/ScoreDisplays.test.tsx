// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,within,fireEvent,cleanup} from '@testing-library/react';
import {CourseClubhouse} from './CourseClubhouse';
import {CourseSelection} from './CourseSelection';
import {MegaResultScorecard} from './MegaResultScorecard';
import {createRun,projectRun,recoverRun} from '@/lib/megaCardGolf/engine';
import {INITIAL_COURSES} from '@/lib/megaCardGolf/config';
afterEach(cleanup);
const rows=[{runId:'even',name:'Even',score:0,rank:1},{runId:'positive',name:'Plus',score:3,rank:2},{runId:'negative',name:'Minus',score:-2,rank:3}];
it('formats course records, both leaderboard tabs, personal rank, archived scores and completed totals without changing data',async()=>{
 const request=vi.fn(async()=>({rows,self:{runId:'outside',name:'Self',score:7,rank:11},personalBest:0}));
 const ui=render(<CourseClubhouse course={INITIAL_COURSES[0]} archives={[{config:INITIAL_COURSES[0],rows}]} request={request as any} busy={false} canStart completedScore={3} onStart={()=>{}} onReturn={()=>{}}/>);
 await screen.findByText('Personal best:');
 for(const table of screen.getAllByRole('table',{hidden:true})){expect(within(table).getByText('+3')).toBeTruthy();expect(within(table).getByText('E')).toBeTruthy();expect(within(table).getByText('-2')).toBeTruthy();}
 expect(screen.getByText(/Your rank: 11/).textContent).toContain('+7');
 expect(document.querySelector('.mega-completed')?.textContent).toContain('+3');
 fireEvent.click(screen.getByRole('button',{name:'All Time'}));await screen.findByText(/Your rank: 11/);
 expect(request).toHaveBeenLastCalledWith(expect.objectContaining({window:'all'}));
 expect(rows.map(r=>r.score)).toEqual([0,3,-2]);ui.unmount();
 render(<CourseSelection courses={INITIAL_COURSES} request={(async(b:any)=>({rows:b.courseId==='sunny-meadows'?[rows[1]]:b.courseId==='coastal-links'?[rows[0]]:[]})) as any} busy={false} onSelect={()=>{}}/>);
 await screen.findByText('Course record: +3');expect(screen.getByText('Course record: E')).toBeTruthy();expect(screen.getByText('Course record: —')).toBeTruthy();
});
it('uses Golf pencil strokes, draws the plus, and leaves future holes and an unplayed total distinct from even',()=>{
 const config={...INITIAL_COURSES[0],holes:18};
 const run=createRun('r','u',config,Array.from({length:18},()=>Array.from({length:52},(_,i)=>i)),0);
 const ui=render(<MegaResultScorecard view={projectRun(run,1)}/>);
 expect(screen.getByRole('img',{name:'—'})).toBeTruthy();expect(screen.queryByRole('img',{name:'E'})).toBeNull();
 const done=recoverRun(run,run.deadline);ui.rerender(<MegaResultScorecard view={projectRun(done,done.deadline-1)} writeHole={1}/>);
 expect(document.querySelectorAll('[data-mega-write]')).toHaveLength(1);
 expect(document.querySelectorAll('.mega-pencil-plus path')).toHaveLength(2);
 expect(screen.getByRole('cell',{name:'Hole 2: not played'}).textContent).toBe('');
 expect(screen.getByRole('cell',{name:'Hole 18: not played'}).textContent).toBe('');
});
