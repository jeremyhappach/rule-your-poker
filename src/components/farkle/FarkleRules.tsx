import type { FarkleConfig } from '@/lib/farkle/types';
import { FARKLE_ENDGAME_LABELS } from '@/lib/farkle/types';

export function FarkleInstructions() {
  return <div className="space-y-2 text-sm">
    <p>Roll six dice. Select a scoring group from that roll and choose Hold Dice. Held points stay in THIS TURN until you bank them.</p>
    <p>Bank to end your turn and add those points to your score, or roll the remaining dice. A roll with no scoring selection is a Farkle: THIS TURN is lost and your turn ends.</p>
    <p>Hold all six dice to get Hot Dice. Your unbanked points remain, and all six dice become available again. Combinations never span rolls.</p>
    <p>Immediate ends on a bank reaching the target. Equal Turns finishes the current turn cycle. One Last Turn gives every other eligible player exactly one final turn, beginning at the next lower occupied seat clockwise; the triggering player gets no extra turn.</p>
    <p>The highest banked score wins. Tied leaders each receive one turn per Tiebreak Turn until one leads. Completed-turn counts always include every turn actually taken.</p>
    <p>Each loser pays the winner the fixed stake once. Real-money timeouts pause the game. In fake money, bot control continues until the player explicitly rejoins; a request during their turn takes effect after that turn.</p>
  </div>;
}

/** The caller supplies the frozen dealer-game/replay snapshot, never current defaults. */
export function FarkleRules({ config }: { config: FarkleConfig }) {
  return <div className="space-y-3">
    {config.testOnly && <p className="font-semibold text-amber-400">{config.testLabel ?? 'TEST ONLY scoring configuration'}</p>}
    <p>Stake {config.ante_amount} · Target {config.targetScore.toLocaleString()} · {FARKLE_ENDGAME_LABELS[config.endgame]}</p>
    <FarkleInstructions />
    <table className="w-full text-sm"><caption className="text-left font-semibold">Frozen scoring rules</caption><tbody>
      <tr><th className="text-left">Single 1 / 5</th><td>{config.rules.singles['1']} / {config.rules.singles['5']}</td></tr>
      {(['3', '4', '5', '6'] as const).map(n => <tr key={n}><th className="text-left">{n} of a kind (1–6)</th><td>{config.rules.ofAKind[n].join(' / ')}</td></tr>)}
      {(['straight', 'threePairs', 'twoTriplets', 'fourPlusPair'] as const).map((rule, i) => <tr key={rule}><th className="text-left">{['Straight', 'Three pairs', 'Two triplets', 'Four + pair'][i]}</th><td>{config.rules[rule] || 'Disabled'}</td></tr>)}
    </tbody></table>
    <p className="text-xs">The server uses the highest valid interpretation of the selected dice. These rules were frozen when this game was created.</p>
  </div>;
}
