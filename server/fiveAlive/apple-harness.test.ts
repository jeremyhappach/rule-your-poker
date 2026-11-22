import assert from 'node:assert/strict';
import {test} from 'node:test';
import {completedMatchOutcome,sealedProjection,submitSealedGuess,type SealedGame} from './rules.ts';

// Same shape as private.five_alive_async_deal; admission helpers deliberately
// keep their ordinary no-repeat validation. The temporary SQL allocator owns this.
function dealt():SealedGame {
 const answers=[{word:'APPLE',difficulty:4},{word:'APPLE',difficulty:4},{word:'APPLE',difficulty:4}] as const;
 const rounds=()=>answers.map(a=>({answer:a.word,difficulty:a.difficulty,guesses:[],completed:false}));
 return {players:['alice','bob'],answers,rounds:[rounds(),rounds()],sharedScores:[0,0],current:0};
}
test('APPLE harness keeps three independent rounds, sixth solve/failure, sealing and authoritative winner',()=>{
 let game=dealt();
 for(let round=0;round<3;round++){
  for(let guess=0;guess<5;guess++)game=submitSealedGuess(game,'alice','STARE',()=>true);
  game=submitSealedGuess(game,'alice','APPLE',()=>true);
  const waiting=sealedProjection(game,'alice');
  assert.equal(waiting.ownResult?.solved,true);
  assert.equal(waiting.ownResult?.score,235);
  assert.equal(waiting.revealed.length,round);
  for(let guess=0;guess<6;guess++)game=submitSealedGuess(game,'bob','STARE',()=>true);
  const result=sealedProjection(game,'alice').revealed[round];
  assert.equal(result.opponent.solved,false);assert.equal(result.opponent.score,0);
 }
 assert.equal(game.current,3);assert.deepEqual(game.sharedScores,[705,0]);
 assert.equal(completedMatchOutcome(game).winner,'alice');
 assert.throws(()=>submitSealedGuess(game,'alice','APPLE',()=>true),/game_complete/);
});
test('APPLE harness retains exact ties and membership guards',()=>{
 let game=dealt();
 assert.throws(()=>submitSealedGuess(game,'outsider','APPLE',()=>true),/forbidden/);
 for(let round=0;round<3;round++)for(const player of ['alice','bob'])game=submitSealedGuess(game,player,'APPLE',()=>true);
 assert.equal(completedMatchOutcome(game).winner,null);
 assert.deepEqual(game.sharedScores,[4200,4200]);
});
