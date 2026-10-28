// @vitest-environment jsdom
import {StrictMode} from 'react';
import {cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/threeFiveSeven/wartime',()=>({emitPresentationLifecycle:vi.fn()}));
vi.mock('@/lib/canonicalShell/chipEndpoints',()=>({resolveChipEndpoint:({ref}:any)=>ref.position===99?null:{x:ref.position*100,y:200}}));
import {LegsToPlayerAnimation} from './LegsToPlayerAnimation';
import {SweepTheLegsAnimation} from './SweepTheLegsAnimation';
afterEach(cleanup);
const end=(el:Element,name:string)=>{const e=new Event('webkitAnimationEnd',{bubbles:true});Object.defineProperty(e,'animationName',{value:name});fireEvent(el,e);};
it('flies directly to the winner, waits for every flight and completes once under Strict Mode',()=>{
 const ref={current:document.createElement('div')};
 const done=vi.fn(),props={triggerId:'round:result',legPositions:[{playerId:'p',position:1,legCount:2}],winnerPosition:2,currentPlayerPosition:null,getClockwiseDistance:()=>0,containerRef:ref,legsToWin:3,onAnimationComplete:done};
 const ui=render(<StrictMode><LegsToPlayerAnimation {...props}/></StrictMode>);
 const flights=document.querySelectorAll('[data-leg-sweep-flight] > div');expect(flights.length).toBe(2);expect(done).not.toHaveBeenCalled();
 end(flights[0],'flight');expect(done).not.toHaveBeenCalled();end(flights[0],'flight');expect(done).not.toHaveBeenCalled();
 end(flights[1],'flight');expect(done).toHaveBeenCalledTimes(1);
 ui.rerender(<StrictMode><LegsToPlayerAnimation {...props}/></StrictMode>);expect(document.querySelectorAll('[data-leg-sweep-flight]').length).toBe(0);
});
it('never substitutes the pot/felt center for an unavailable winner seat',()=>{
 const ref={current:document.createElement('div')};const done=vi.fn();
 render(<LegsToPlayerAnimation triggerId="missing" legPositions={[{playerId:'p',position:1,legCount:2}]} winnerPosition={99} currentPlayerPosition={null} getClockwiseDistance={()=>0} containerRef={ref} legsToWin={3} onAnimationComplete={done}/>);
 expect(document.querySelectorAll('[data-leg-sweep-flight]').length).toBe(0);expect(done).toHaveBeenCalledTimes(1);
});
it('holds a completed overlay until the owner dismisses it and ignores child animations',()=>{
 const done=vi.fn();const ui=render(<StrictMode><SweepTheLegsAnimation show holdUntilDismissed onComplete={done}/></StrictMode>);
 const overlay=document.querySelector('[data-sweep-the-legs-overlay]')!;
 end(overlay.querySelector('img')!,'imageSlideIn');expect(done).not.toHaveBeenCalled();
 end(overlay,'sweepSequence');end(overlay,'sweepSequence');expect(done).toHaveBeenCalledTimes(1);expect(document.querySelector('[data-sweep-the-legs-overlay]')).not.toBeNull();
 ui.rerender(<SweepTheLegsAnimation show={false} holdUntilDismissed onComplete={done}/>);expect(document.querySelector('[data-sweep-the-legs-overlay]')).toBeNull();
});
