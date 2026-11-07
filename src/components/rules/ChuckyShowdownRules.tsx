import {winBonus} from '@/lib/chuckyShowdown/model';
import type {V2Config} from '@/lib/chuckyShowdown/model';
import type {RuleRendererProps} from '@/lib/gameCatalog/types';

export default function ChuckyShowdownRules({config}:RuleRendererProps){
  const c=config as V2Config|undefined;
  if(c?.version==='chucky-showdown/2'||c?.version==='chucky-showdown/3')return <div className="space-y-3">
    <p>Play three rounds. Every hand starts with four fresh private cards and four community cards from a shuffled 52-card deck. Only the first two community cards start face-up.</p>
    <h3>Fold or Stay</h3><p>Each round gives you {c.maxFolds} folds and {c.maxCracks} cracks. Fold to keep your round points and deal a new hand. Your last Fold banks the round, even at zero. The {c.foldMs/1000}-second decision clock automatically folds at expiry.</p>
    <h3>Choose a Chucky level</h3><p>Stay commits you to a showdown. After the last two community cards flip, pick any available level from 1 to 7. The {c.selectMs/1000}-second selection clock picks the lowest available level at expiry. Each level has two uses per round. Either outcome spends one use.</p>
    <p>Chucky draws one private card per level. Each side makes its best five-card poker hand from its private cards and the same four community cards. There are no wild cards. Chucky wins ties.</p>
    <table><caption>Win bonuses for this run</caption><thead><tr><th>Chucky cards</th><th>Points</th></tr></thead><tbody>{Array.from({length:7},(_,i)=><tr key={i}><td>{i+1}</td><td>{winBonus(c,i+1).toLocaleString()}</td></tr>)}</tbody></table>
    <h3>Score the round</h3><p>Win the bonus shown above and take a fresh hand. A crack wipes your at-risk points and costs one crack. Your last crack busts the round for zero. Spending all 14 challenges banks the points left after the final showdown. Folds, cracks and level uses reset each round. Your final score adds the three rounds, with no time bonus.</p>
  </div>;
  const seconds=Number((config as {durationMs?:number})?.durationMs??30000)/1000;
  return <div className="space-y-3">
    <p>Play three hands in each of three rounds. Each hand starts with four private cards and four shared community cards from a standard deck.</p>
    <h3>Choose a showdown</h3><p>Pick any available level from 1 to 7. The level gives Chucky that many private cards. Each of you makes the best five-card poker hand from your own cards and the same four community cards. There are no wilds. Chucky wins ties.</p>
    <h3>Press or bank</h3><p>Beat a level to add 100 points per Chucky card to At Risk. Your four private cards stay. All other cards are shuffled for a fresh board. Each level can pay once per hand, in any order. Clear all seven to bank 2,800 automatically.</p>
    <p>Bank at any decision, even for zero. Getting cracked loses the current hand’s At Risk points. Your round bank and completed rounds are secure. Every new hand resets the levels.</p>
    <h3>Decision clock</h3><p>You have {seconds} seconds after the board is dealt. Expiration banks your hand. Time adds no bonus. Your final score is the sum of the nine hand payouts.</p>
  </div>;
}
