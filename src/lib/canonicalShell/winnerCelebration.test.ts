// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import confetti from 'canvas-confetti';
import {celebrateCanonicalWinner} from './winnerCelebration';
vi.mock('canvas-confetti',()=>({default:vi.fn()}));
it('admits only eligible winning viewers and consumes each settlement once',()=>{
 celebrateCanonicalWinner('test-receipt','loser',['winner'],true);
 celebrateCanonicalWinner('test-receipt','winner',['winner'],false);
 expect(confetti).not.toHaveBeenCalled();
 celebrateCanonicalWinner('test-receipt','winner',['winner'],true);
 celebrateCanonicalWinner('test-receipt','winner',['winner'],true);
 expect(confetti).toHaveBeenCalledTimes(1);
 celebrateCanonicalWinner('test-receipt','tied',['winner','tied'],true);
 expect(confetti).toHaveBeenCalledTimes(2);
});
