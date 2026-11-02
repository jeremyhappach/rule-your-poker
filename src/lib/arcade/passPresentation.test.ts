import {expect,it} from 'vitest';
import {confirmedArcadePass} from './passPresentation';
import {createSoloRun,applySolo,soloProjection} from './run21';
import {duration} from '@/lib/run21/rules';
import {RUN21_RULESETS} from '@/lib/run21/rulesets';

it('uses actual Arcade projections, whose events omit Pass, and rejects stale/rejected/other-round responses',()=>{
 const shared=Object.values(RUN21_RULESETS).at(-1)!;
 const config={...shared,roundDurationMs:duration(shared),scorePresentationMs:5000};
 const row:any={id:'run',user_id:'user',game:'run21',ruleset:config.preset,config,revision:1};
 row.state=createSoloRun(row,1000,()=>Array.from({length:52},()=>({rank:'2',suit:'spades'})));
 const before=soloProjection(row,'You',10000),board=before.view.boards.user!;
 const command:any={requestId:'fresh',playerId:'user',roundId:before.view.roundId,revision:board.revision,runRevision:1,intent:{type:'pass'}};
 const after=soloProjection({...row,revision:2,state:applySolo(row.state,{type:'pass'},10000)},'You',10000);
 expect(after.events).toEqual([]);expect(confirmedArcadePass(before,after,command)).toBe(true);
 expect(confirmedArcadePass(before,before,command)).toBe(false);
 expect(confirmedArcadePass(before,{...after,revision:3},command)).toBe(false);
 expect(confirmedArcadePass(before,after,{...command,roundId:'other'})).toBe(false);
 expect(confirmedArcadePass(before,after,{...command,playerId:'other'})).toBe(false);
});
