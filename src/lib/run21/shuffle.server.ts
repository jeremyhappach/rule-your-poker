import { type DeckEvidence, type Identity } from './model.js';
import { standardDeck, cardKey } from './rules.js';

function context(identity: Identity, roundId: string, evidence: Pick<DeckEvidence, 'cards' | 'salt'>) {
  return JSON.stringify(['run21-shuffle/1', identity.sessionId, identity.dealerGameId, identity.handNumber, roundId, evidence.salt, evidence.cards.map(cardKey)]);
}
export async function commitmentFor(identity: Identity, roundId: string, evidence: Pick<DeckEvidence, 'cards' | 'salt'>, playerId?: string): Promise<string> {
  const message = playerId === undefined ? context(identity, roundId, evidence) :
    JSON.stringify(['run21-shuffle/2', identity.sessionId, identity.dealerGameId, identity.handNumber, roundId, playerId, evidence.salt, evidence.cards.map(cardKey)]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
/** Server CSPRNG only. Rejection sampling avoids biased shuffle indices. No seed goes to clients. */
export function shuffleCards() {
  const cards = standardDeck();
  for (let i = cards.length - 1; i > 0; i--) {
    const bound = i + 1;
    const limit = Math.floor(0x100000000 / bound) * bound;
    let n: number;
    do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= limit);
    const j = n % bound;
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
export async function shuffleRound(identity: Identity, roundId: string, playerId?: string): Promise<DeckEvidence> {
  const cards = shuffleCards();
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  return {cards, salt, commitment: await commitmentFor(identity, roundId, {cards, salt}, playerId)};
}
