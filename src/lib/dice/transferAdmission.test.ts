import {expect,it} from 'vitest';
import {diceTransferReady} from './transferAdmission';
const token='ship-captain-crew|winseq|session|dealer|1|round';
it('requires the exact terminal round and completed local presentation',()=>{
 expect(diceTransferReady(token,'dealer','round','dealer',false,false,'round')).toBe(false);
 expect(diceTransferReady(token,'dealer','round','dealer',true,true,'round')).toBe(false);
 expect(diceTransferReady(token,'dealer','round','dealer',true,false,'round')).toBe(true);
 expect(diceTransferReady(token,'dealer','other','dealer',true,false,'other')).toBe(false);
});
it.each([undefined,null,'prior-round','tie-rollover-round','future-round'])('reconciles unowned batch %s without a completion receipt',round=>{
 expect(diceTransferReady(token,'dealer','round','dealer',true,true,round)).toBe('reconcile');
});
it('never attaches a different dealer to a current round receipt',()=>{
 expect(diceTransferReady(token,'dealer','round','prior-dealer',true,false,'round')).toBe('reconcile');
});
