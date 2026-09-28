import type { FarkleConfig, FarkleRules as FrozenFarkleRules } from '@/lib/farkle/types';
import { FARKLE_ENDGAME_LABELS } from '@/lib/farkle/types';

export interface FarkleScoringRow {
  id: string;
  label: string;
  points: number;
}

const kindNames = { '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six' } as const;

/**
 * Produces a quick-reference view of the exact frozen scoring contract.
 * Zero-valued rules are disabled by the dealer-game configuration.
 */
export function farkleScoringRows(rules: FrozenFarkleRules): FarkleScoringRow[] {
  const rows: FarkleScoringRow[] = [];
  const add = (id: string, label: string, points: number) => {
    if (points > 0) rows.push({ id, label, points });
  };

  add('single-1', 'Single 1', rules.singles['1']);
  add('single-5', 'Single 5', rules.singles['5']);

  (['3', '4', '5', '6'] as const).forEach(kind => {
    const values = rules.ofAKind[kind];
    const enabled = values.map((points, index) => ({ points, face: index + 1 })).filter(({ points }) => points > 0);
    if (!enabled.length) return;

    if (enabled.length === values.length && enabled.every(({ points }) => points === enabled[0].points)) {
      add(`kind-${kind}`, `${kindNames[kind]} of a Kind`, enabled[0].points);
      return;
    }

    enabled.forEach(({ points, face }) => add(`kind-${kind}-${face}`, `${kindNames[kind]} ${face}s`, points));
  });

  add('straight', 'Straight', rules.straight);
  add('three-pairs', 'Three Pairs', rules.threePairs);
  add('two-triplets', 'Two Triplets', rules.twoTriplets);
  add('four-plus-pair', 'Four of a Kind + Pair', rules.fourPlusPair);
  return rows;
}

export function FarkleScoringTable({ rules }: { rules: FrozenFarkleRules }) {
  return <table className="w-full border-collapse text-[15px] leading-5 sm:text-base" data-farkle-scoring-table>
    <caption className="sr-only">Farkle scoring</caption>
    <thead className="border-b border-amber-200/35 text-xs uppercase tracking-wide text-amber-200">
      <tr><th scope="col" className="py-1.5 text-left font-semibold">Score</th><th scope="col" className="py-1.5 text-right font-semibold">Points</th></tr>
    </thead>
    <tbody>
      {farkleScoringRows(rules).map(row => <tr key={row.id} className="border-b border-white/10 even:bg-white/5">
        <th scope="row" className="py-2 pr-3 text-left font-medium text-foreground">{row.label}</th>
        <td className="py-2 text-right font-semibold tabular-nums text-amber-100">{row.points.toLocaleString('en-US')}</td>
      </tr>)}
    </tbody>
  </table>;
}

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
