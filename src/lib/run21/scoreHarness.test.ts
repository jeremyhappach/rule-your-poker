// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {roundDeck} from '../../../server/run21/harness';
import {commitmentFor} from './shuffle.server';
import {act,fixtureDeck,IDENTITY,PLAYERS,uuid} from './fixtures';
import {createMatch,prepareRound,advanceScorePresentation,project} from './engine';
import {DEFAULT_CONFIG} from './model';
import {chooseAction} from './bot';
import {cardKey} from './rules';

describe('server-only, all-player score harness decks',()=>{
  it.each([undefined,'none','unknown'])('preserves the supplied CSPRNG path for %s',async mode=>{
    const evidence=fixtureDeck(),shuffle=vi.fn(async()=>evidence);
    expect(await roundDeck(IDENTITY,uuid(80),mode,shuffle)).toBe(evidence);
    expect(shuffle).toHaveBeenCalledExactlyOnceWith(IDENTITY,uuid(80));
  });
  it.each([104,105])('produces %i by legal placement and normal bot play across round identities',async score=>{
    for(let n=0;n<16;n++){
      const roundId=uuid(80+n),deck=await roundDeck(IDENTITY,roundId,`always_${score}`);
      expect(new Set(deck.cards.map(cardKey)).size).toBe(52);
      expect(deck.commitment).toBe(await commitmentFor(IDENTITY,roundId,deck));
      let match=prepareRound(createMatch(IDENTITY,PLAYERS,1,DEFAULT_CONFIG,0),roundId,null,deck,0);
      const human=PLAYERS[0].id,bot=PLAYERS[1].id;
      match=act(match,human,{type:'ready'},0);
      for(const column of [0,1,2,3,0,1,2,3,4,4,4])match=act(match,human,{type:'place',column},match.updatedAt+1);
      match=act(match,human,{type:'collect'},match.updatedAt+1);
      expect(match.rounds[0].boards[human].result).toMatchObject({aggregate:score,totals:[21,21,21,21,score-84],multiplier:score===105?1000:500});
      const phase=match.rounds[0].scorePresentation!;
      expect(phase.endsAt-phase.startedAt).toBe(5000);
      match=advanceScorePresentation(match,phase.endsAt);
      for(let i=0;i<60&&!match.rounds[0].boards[bot].result;i++){
        const choice=chooseAction(project(match,bot),match.updatedAt)!;
        match=act(match,bot,choice.intent,match.updatedAt+choice.delayMs);
      }
      expect(match.rounds[0].boards[bot].result?.aggregate).toBe(score);
      expect(match.rounds[0].boards[bot].presented.slice(0,11)).toEqual(match.rounds[0].boards[human].presented.slice(0,11));
    }
  });
});
