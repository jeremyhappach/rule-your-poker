import {describe,expect,it} from 'vitest';
import {sanitizeQuintzeeRollTiming as sanitize} from './quintzeeRollTiming';
describe('Quintzee presentation duration',()=>{
 it('retains 1500 ms for missing or invalid persisted values',()=>{for(const v of [null,{}, {durationMs:NaN},{durationMs:Infinity},{durationMs:'500'}])expect(sanitize(v)).toEqual({durationMs:1500});});
 it('bounds and rounds presentation settings without accepting arbitrary timers',()=>{expect(sanitize({durationMs:0}).durationMs).toBe(300);expect(sanitize({durationMs:99999}).durationMs).toBe(2500);expect(sanitize({durationMs:727}).durationMs).toBe(750);});
});
