// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/hooks/useDeviceSize',()=>({useDeviceSize:()=>({isTablet:false,isDesktop:false})}));
vi.mock('@/lib/wave5GameplayGeometry/AssignedRectPx',()=>({useIsRectDriven:()=>true}));
vi.mock('./DiceRollAnimation',()=>({DiceRollAnimation:()=> <div data-testid="fly-in"/>}));
import {DiceTableLayout} from './DiceTableLayout';
afterEach(cleanup);
const dice=[1,2,3,4,5].map(value=>({value,isHeld:false}));
it('preserves legacy observer admission when the Horses/SCC classifier is not supplied',()=>{
 const props={dice,isObserver:true,rollKey:789,cacheKey:'legacy-yahtzee',gameType:'yahtzee'};
 const h=render(<DiceTableLayout {...props}/>);
 expect(h.queryByTestId('fly-in')).toBeNull();
 h.rerender(<DiceTableLayout {...props} animationOrigin={{x:0,y:0}}/>);
 expect(h.queryByTestId('fly-in')).toBeNull();
});
it('shows historical opponent dice without replaying their old roll after a fresh mount',()=>{
 const h=render(<DiceTableLayout dice={dice} isObserver observerRollLive={false} rollKey={123} cacheKey="historical" animationOrigin={{x:0,y:0}}/>);
 expect(h.queryByTestId('fly-in')).toBeNull();expect(h.container.querySelectorAll('[data-die-value]')).toHaveLength(5);
});
it('admits a live observer roll after controller classification and consumes it once',()=>{
 const props={dice,isObserver:true,rollKey:456,cacheKey:'live',animationOrigin:{x:0,y:0}};
 const h=render(<DiceTableLayout {...props} observerRollLive={false}/>);
 expect(h.queryByTestId('fly-in')).toBeNull();h.rerender(<DiceTableLayout {...props} observerRollLive/>);
 expect(h.queryByTestId('fly-in')).not.toBeNull();h.unmount();
 const again=render(<DiceTableLayout {...props} observerRollLive/>);expect(again.queryByTestId('fly-in')).toBeNull();
});
