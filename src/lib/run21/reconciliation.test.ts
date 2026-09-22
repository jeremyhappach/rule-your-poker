import {describe,it,expect,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:new Proxy({}, {get(){throw new Error('Pure reconciliation test');}})}));
import {run21Setup} from './discovery';
import {resolveExactRunBackConfig} from '../dealerGameSetup/runBackConfig';
import {deriveFeltGameKind} from '../canonicalShell/ShellOwnedFeltHost';

describe('Run21 reconciled discovery and setup',()=>{
  it('uses one match stake and exactly two distinct players',()=>{
    expect(run21Setup(5,['one','two'])).toEqual({gameType:'run21',stake:5,playerIds:['one','two']});
    expect(()=>run21Setup(5,['one','one'])).toThrow();
    expect(resolveExactRunBackConfig('run21',{ante_amount:5})).toEqual({ante_amount:5});
  });
  it('preserves existing card/dice routing and admits the Run21 shell plate',()=>{
    for(const game of ['cribbage','gin-rummy','horses','ship-captain-crew','yahtzee','run21'])
      expect(deriveFeltGameKind(game)).toBe(game);
  });
});
