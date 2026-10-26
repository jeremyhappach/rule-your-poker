import {expect,it} from 'vitest';import {resolveExactRunBackConfig} from './runBackConfig';
it('retains the exact admitted Quintzee theme and stake, rejecting incomplete snapshots',()=>{
 for(const theme of ['classic','modern'])expect(resolveExactRunBackConfig('quintzee',{ante_amount:7,theme,rules:{version:'quintzee/1'}})).toEqual({ante_amount:7,theme});
 expect(resolveExactRunBackConfig('quintzee',{ante_amount:7})).toBeNull();expect(resolveExactRunBackConfig('quintzee',{ante_amount:7,theme:'bad'})).toBeNull();
});