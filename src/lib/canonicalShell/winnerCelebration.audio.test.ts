// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {celebrateCanonicalWinner} from './winnerCelebration';
const mocks=vi.hoisted(()=>({sound:vi.fn(),confetti:vi.fn()}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:mocks.sound}));
vi.mock('canvas-confetti',()=>({default:mocks.confetti}));
afterEach(()=>{vi.clearAllMocks();sessionStorage.clear();});
it('admits Winner A once at an eligible settled winner celebration',()=>{
 celebrateCanonicalWinner('settled-result','viewer',['viewer'],true);
 celebrateCanonicalWinner('settled-result','viewer',['viewer'],true);
 expect(mocks.sound).toHaveBeenCalledTimes(1);expect(mocks.sound.mock.calls[0].slice(0,2)).toEqual(['winner','settled-result']);
});
it('rejects intermediate/ineligible results and observers or losing players',()=>{
 celebrateCanonicalWinner('round-result','viewer',['viewer'],false);
 celebrateCanonicalWinner('other-winner','viewer',['opponent'],true);
 expect(mocks.sound).not.toHaveBeenCalled();
});
it('retains async review confetti while explicitly suppressing historical audio',()=>{
 celebrateCanonicalWinner('async-saved-result','viewer',['viewer'],true,false);
 expect(mocks.confetti).toHaveBeenCalledOnce();expect(mocks.sound).not.toHaveBeenCalled();
});
