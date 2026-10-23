// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {MegaCardGolfGame} from './MegaCardGolfGame';
import {createRun,applyIntent,recoverRun,projectRun} from '@/lib/megaCardGolf/engine';
import {INITIAL_COURSES,MEGA_SEQUENTIAL_RULESET} from '@/lib/megaCardGolf/config';
vi.mock('@/hooks/useVisualPreferences',()=>({useVisualPreferences:()=>({getCardBackColors:()=>({color:'#174b38',darkColor:'#123'}),getCardBackId:()=>'',getEffectiveDeckColorMode:()=> 'two_color'}),FOUR_COLOR_SUITS:{}}));
vi.mock('@/hooks/useDeviceSize',()=>({useDeviceSize:()=>({isTablet:false})}));
afterEach(cleanup);
it('v2 opening taps submit one choice with no confirmation or speculative face',()=>{
 const run=createRun('r','u',INITIAL_COURSES[0],Array.from({length:9},()=>Array.from({length:52},(_,i)=>i)),0,MEGA_SEQUENTIAL_RULESET);
 const onIntent=vi.fn(),props={view:projectRun(run,1),now:1,busy:false,onIntent,onExit:vi.fn()};
 const {rerender}=render(<MegaCardGolfGame {...props}/>);
 expect(screen.queryByRole('button',{name:'Reveal selected'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Card 1/}));expect(onIntent).toHaveBeenCalledExactlyOnceWith({type:'open',indices:[0]});
 expect(screen.getByRole('button',{name:'Card 1 · concealed'})).toBeTruthy();
 const first=applyIntent(run,{type:'open',indices:[0]},2);rerender(<MegaCardGolfGame {...props} view={projectRun(first,2)}/>);
 expect(screen.getByRole('button',{name:'Card 1 · A ♠'}).hasAttribute('disabled')).toBe(true);
 expect(screen.getByText('Choose 1 opening card')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Card 2/}));expect(onIntent).toHaveBeenLastCalledWith({type:'open',indices:[1]});
});
function fixture(){
 let run=applyIntent(createRun('r','u',INITIAL_COURSES[0],Array.from({length:9},()=>Array.from({length:52},(_,i)=>i)),0),{type:'open',indices:[0,5]},1);
 for(const index of [1,2,3])run=applyIntent(applyIntent(run,{type:'draw'},2),{type:'replace',index},3);
 return applyIntent(run,{type:'draw'},4);
}
it('Tap In? cancel has no action or hidden face; confirmation commits once',()=>{
 const run=fixture(),onIntent=vi.fn(),props={view:projectRun(run,4),now:4,busy:false,onIntent,onExit:vi.fn()};
 const {container}=render(<MegaCardGolfGame {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:/Card 5/}));
 expect(screen.getByRole('alertdialog').textContent).toContain('Tap In?');
 expect(container.querySelector('[aria-label="Card 5 · concealed"]')).not.toBeNull();expect(onIntent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(onIntent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/Card 5/}));fireEvent.click(screen.getByRole('button',{name:'Tap In?'}));
 expect(onIntent).toHaveBeenCalledExactlyOnceWith({type:'replace',index:4});
});
it('timeout invalidates confirmation without waiting for consent; pending-only discard and no redundant draw button',()=>{
 const run=fixture(),intent=vi.fn(),props={view:projectRun(run,4),now:4,busy:false,onIntent:intent,onExit:vi.fn()};
 const {rerender}=render(<MegaCardGolfGame {...props}/>);
 expect(screen.queryByRole('button',{name:'Draw a card'})).toBeNull();expect(screen.getByRole('button',{name:'Discard'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Card 5/}));
 const completed=recoverRun(run,run.deadline);
 rerender(<MegaCardGolfGame {...props} now={run.deadline} view={projectRun(completed,run.deadline)}/>);
 expect(screen.queryByRole('alertdialog')).toBeNull();expect(intent).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Discard'})).toBeNull();
});
it('abandon requires canonical confirmation and animation lock prevents play',()=>{
 const run=fixture(),intent=vi.fn(),exit=vi.fn(),props={view:projectRun(run,4),now:4,busy:false,onIntent:intent,onExit:exit};
 const {rerender}=render(<MegaCardGolfGame {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Abandon'}));fireEvent.click(screen.getByRole('button',{name:'Keep Playing'}));expect(exit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Abandon'}));fireEvent.click(screen.getByRole('button',{name:'Abandon Game'}));expect(exit).toHaveBeenCalledOnce();
 rerender(<MegaCardGolfGame {...props} busy/>);
 fireEvent.click(screen.getByRole('button',{name:/Card 5/}));fireEvent.click(screen.getByRole('button',{name:'Discard'}));expect(intent).not.toHaveBeenCalled();
});
