import {randomInt,randomUUID} from 'node:crypto';
import {fixtureDeck} from '../../src/lib/canasta/rules.js';

/** Only faces are reused; neither order nor physical identity reaches a client before reveal. */
export function secureDeck(){
  const cards=fixtureDeck().map(c=>({id:randomUUID(),face:c.face}));
  for(let i=cards.length-1;i>0;i--){const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
  return cards;
}
