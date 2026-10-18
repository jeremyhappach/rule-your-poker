import {expect,it,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {resolveExactRunBackConfig} from '@/lib/dealerGameSetup/runBackConfig';
import {parseDealerGameSetupCommitResult} from '@/lib/dealerGameSetupAuthority';
import {TRI_TOWERS} from './model';
it('registers the authoritative fullscreen key while ordinary selection stays closed',()=>{
 expect(TRI_TOWERS).toMatchObject({id:'tri-towers',label:'TriTowers',presentationMode:'fullscreen',publicSelection:false});
 expect(resolveExactRunBackConfig('tri-towers',{ante_amount:5,rules:{score:999}})).toEqual({ante_amount:5});
 expect(resolveExactRunBackConfig('tri-towers',{})).toBeNull();
});
it('accepts committed TriTowers setup only in the canonical ante phase',()=>{
 const deadline='2026-10-14T23:00:00.000Z',expected={gameId:'s',dealerPlayerId:'p',expectedDealerPosition:2,expectedConfigDeadline:deadline,gameType:'tri-towers' as const,config:{ante_amount:5}};
 const data={outcome:'configured',deduped:false,setup_identity:{game_id:'s',dealer_position:2,expected_config_deadline:deadline},game:{id:'s',status:'ante_decision',config_complete:true,current_game_uuid:'d'},dealer_game:{id:'d',session_id:'s',game_type:'tri-towers'},players:[{id:'p',position:2,ante_decision:'ante_up',sitting_out:false}]};
 expect(parseDealerGameSetupCommitResult(data,expected).dealer_game.id).toBe('d');
 expect(()=>parseDealerGameSetupCommitResult({...data,game:{...data.game,status:'in_progress'}},expected)).toThrow();
});
