import {describe,it,expect} from 'vitest';
import {fixtureDeck,compareCards,standard,type Meld} from '@/lib/canasta/rules';
import {isResolvedJoker} from '@/lib/cardGames/physicalCard';
import {compareHandCards,orderedMeldRanks,canastaLabel} from './presentation';
const deck=fixtureDeck(),rank=(r:string)=>deck.filter(c=>standard(c)?.rank===r);
describe('Canasta presentation order',()=>{
  it('keeps every physical copy and puts twos after all Jokers without changing timeout order',()=>{
    const cards=[rank('2')[0],rank('A')[0],...deck.filter(c=>isResolvedJoker(c.face)),rank('2')[4],rank('A')[4]];
    const sorted=[...cards].sort(compareHandCards);
    expect(sorted.map(c=>standard(c)?.rank??'Joker')).toEqual(['A','A','Joker','Joker','Joker','Joker','2','2']);
    expect(new Set(sorted.map(c=>c.id))).toEqual(new Set(cards.map(c=>c.id)));
    expect(compareCards(rank('2')[0],deck.find(c=>isResolvedJoker(c.face))!)).toBeLessThan(0);
  });
  it('places committed canastas before rank-sorted groups without treating drafts or black threes as canastas',()=>{
    const melds:Meld[]=[{rank:'10',cards:rank('10').slice(0,3)},{rank:'Q',cards:rank('Q').slice(0,7)},
      {rank:'5',cards:rank('5').slice(0,3)},{rank:'8',cards:[...rank('8').slice(0,6),rank('2')[0]]}];
    expect(orderedMeldRanks(melds,[{rank:'A',cards:rank('A').slice(0,7)}])).toEqual(['8','Q','A','5','10']);
    expect(canastaLabel(melds[1])).toBe('Natural canasta');expect(canastaLabel(melds[3])).toBe('Mixed canasta');
    expect(canastaLabel({rank:'3',cards:rank('3')})).toBeNull();
  });
});
