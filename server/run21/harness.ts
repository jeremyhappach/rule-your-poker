import {randomBytes} from 'node:crypto';
import type {Card, Identity} from '../../src/lib/run21/model.js';
import {cardKey, standardDeck} from '../../src/lib/run21/rules.js';
import {commitmentFor, shuffleRound} from '../../src/lib/run21/shuffle.server.js';

/** Only the private, setup-frozen database marker selects a deck. Never a request/projection. */
export async function roundDeck(identity: Identity, roundId: string, harness: string | undefined, shuffle = shuffleRound) {
  if (harness !== 'always_104' && harness !== 'always_105') return shuffle(identity, roundId);
  const cards: Card[] = harness === 'always_105'
    ? [{rank:'10',suit:'clubs'},{rank:'10',suit:'diamonds'},{rank:'10',suit:'hearts'},{rank:'10',suit:'spades'}]
    : [{rank:'K',suit:'clubs'},{rank:'Q',suit:'clubs'},{rank:'J',suit:'clubs'},{rank:'10',suit:'clubs'}];
  cards.push(...(['clubs','diamonds','hearts','spades'] as const).map(suit=>({rank:'A' as const,suit})),
    harness==='always_105'?{rank:'J',suit:'clubs'}:{rank:'10',suit:'diamonds'},
    {rank:harness==='always_105'?'9':'8',suit:'clubs'},{rank:'2',suit:'clubs'});
  const prefix = new Set(cards.map(cardKey));
  cards.push(...standardDeck().filter(card=>!prefix.has(cardKey(card))));
  const salt=randomBytes(32).toString('hex');
  return {cards,salt,commitment:await commitmentFor(identity,roundId,{cards,salt})};
}
