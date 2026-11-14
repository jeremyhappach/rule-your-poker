import {describe,expect,it} from 'vitest';
import type {ChessSnapshot} from './client';
import {chessSettlementMatchesBatch,chessSettlementNet} from './settlementPresentation';

// Amounts and zero opening balances reproduce the November 14 incident.
function settled(viewerId='loser'){
 return {id:'chess',identity:{sessionId:'session',dealerGameId:'chess',roundId:'round'},viewerId,
  players:[{id:'loser'},{id:'winner'}],settled:true,settlement:{loser:-5,winner:5},terminal:{resultId:'result'},
  financial:{resultId:'result',balances:{loser:-5,winner:5},batch:{id:'batch',game_id:'session',dealer_game_id:'chess',cursor:1,
   transfers:[{id:'transfer',from:{kind:'player',playerId:'loser'},to:{kind:'player',playerId:'winner'},amount:5}],
   opening_balances:{'player:loser':0,'player:winner':0},closing_balances:{'player:loser':-5,'player:winner':5}}}} as unknown as ChessSnapshot;
}
describe('Chess settlement display evidence',()=>{
 it.each([['loser',-5],['winner',5]] as const)('reads %s net from the actual transfer, not a zero pot or cumulative balance', (viewer,expected)=>{
  const v=settled(viewer);expect(chessSettlementNet(v)).toBe(expected);
  for(const id of ['loser','winner']){v.financial.balances[id]+=100;v.financial.batch.opening_balances['player:'+id]+=100;v.financial.batch.closing_balances['player:'+id]+=100;}
  expect(chessSettlementNet(v)).toBe(expected);
 });
 it('admits an authoritative zero-transfer draw',()=>{const v=settled();v.settlement={loser:0,winner:0};v.financial.batch=null;expect(chessSettlementNet(v)).toBe(0);});
 it.each(['amount','recipient','dealer','session','opening','closing','balance','result','missing','nonfinite','unbalanced','unknown'])('exposes %s mismatch instead of displaying zero',kind=>{
  const v=settled(),b=v.financial.batch;
  if(kind==='amount')b.transfers[0].amount=4;
  if(kind==='recipient')b.transfers[0].to.playerId='outsider';
  if(kind==='dealer')b.dealer_game_id='next';
  if(kind==='session')b.game_id='other';
  if(kind==='opening')b.opening_balances['player:loser']=100;
  if(kind==='closing')b.closing_balances['player:winner']=0;
  if(kind==='balance')v.financial.balances.winner=0;
  if(kind==='result')v.financial.resultId='other-result';
  if(kind==='missing')v.financial.batch=null;
  if(kind==='nonfinite')v.settlement!.loser=NaN;
  if(kind==='unbalanced')v.settlement!.winner=6;
  if(kind==='unknown')v.settlement!.extra=0;
  expect(chessSettlementNet(v)).toBeNull();
 });
 it('rejects a different transfer batch even with matching amounts',()=>{const v=settled();expect(chessSettlementMatchesBatch(v,{...v.financial.batch,id:'other'})).toBe(false);});
});
