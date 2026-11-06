import type {RuleRendererProps} from '@/lib/gameCatalog/types';

export default function ChuckyShowdownRules({config}:RuleRendererProps){
  const seconds=Number((config as {durationMs?:number})?.durationMs??30000)/1000;
  return <div className="space-y-3">
    <p>Play three hands in each of three rounds. Each hand starts with four private cards and four shared community cards from a standard deck.</p>
    <h3>Choose a showdown</h3><p>Pick any available level from 1 to 7. The level gives Chucky that many private cards. Each of you makes the best five-card poker hand from your own cards and the same four community cards. There are no wilds. Chucky wins ties.</p>
    <h3>Press or bank</h3><p>Beat a level to add 100 points per Chucky card to At Risk. Your four private cards stay. All other cards are shuffled for a fresh board. Each level can pay once per hand, in any order. Clear all seven to bank 2,800 automatically.</p>
    <p>Bank at any decision, even for zero. Getting cracked loses the current hand’s At Risk points. Your round bank and completed rounds are secure. Every new hand resets the levels.</p>
    <h3>Decision clock</h3><p>You have {seconds} seconds after the board is dealt. Expiration banks your hand. Time adds no bonus. Your final score is the sum of the nine hand payouts.</p>
  </div>;
}
