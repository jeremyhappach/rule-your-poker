// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {Run21Authority,type StoredMatch} from '../../../server/run21/authority';
import {fixtureMatch,IDENTITY,PLAYERS,uuid} from './fixtures';
it('pins retained reads and close to the completed match without cancelling its successor timer or cache',async()=>{
 const state=fixtureMatch();state.settlement={key:'old',resultId:uuid(500),transferBatchId:uuid(501),winnerId:PLAYERS[0].id,loserId:PLAYERS[1].id,amount:5,at:1};
 const old:StoredMatch={game_id:IDENTITY.sessionId,dealer_game_id:IDENTITY.dealerGameId,first_round_id:state.rounds[0].id,dealer_user_id:uuid(30),participants:PLAYERS.map((p,i)=>({...p,userId:uuid(30+i),chips:0})),stake:5,balances:{},revision:43,state,bot_due_at:null,finished:true};
 const next={...old,dealer_game_id:uuid(600),finished:false,state:null,revision:0};
 const close=vi.fn(),commit=vi.fn();
 const authority=new Run21Authority({load:async()=>[old,next],close,commit,confirm:vi.fn()});
 authority.admit(next);
 const clear=vi.spyOn(globalThis,'clearTimeout');
 try{
  const view=await authority.observe(IDENTITY.sessionId,uuid(30),0,old.dealer_game_id);
  expect(view.view.identity.dealerGameId).toBe(old.dealer_game_id);
  await authority.close(IDENTITY.sessionId,uuid(30),old.dealer_game_id);
  expect(close).toHaveBeenCalledWith(old.dealer_game_id,uuid(30));expect(clear).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
  expect(authority['committed'].get(IDENTITY.sessionId)).toBe(next);
 }finally{clear.mockRestore();authority.dispose();}
});
