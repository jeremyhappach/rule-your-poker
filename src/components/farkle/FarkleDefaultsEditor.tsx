import { useEffect, useState } from 'react';
import { loadFarkleAdminDefaults, type FarkleAdminDefaults } from '@/lib/farkle/dealerDefaults';
import { FARKLE_ENDGAME_LABELS } from '@/lib/farkle/types';

/** Displays the approved server defaults; individual games retain their frozen snapshot. */
export function FarkleDefaultsEditor() {
  const [defaults, setDefaults] = useState<FarkleAdminDefaults | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadFarkleAdminDefaults().then(value => { if (active) setDefaults(value); })
      .catch(() => { if (active) setError('Farkle defaults are unavailable.'); });
    return () => { active = false; };
  }, []);
  if (!defaults) return <p role="status">{error || 'Loading Farkle defaults…'}</p>;
  const { scoring, endgame, botPolicy, botBankThreshold } = defaults.farkle_rules;
  return <section className="space-y-3" aria-label="Farkle approved production defaults">
    <p className="text-amber-300">Approved production defaults · Admin playtest</p>
    <p>Target {defaults.points_to_win.toLocaleString()} · {FARKLE_ENDGAME_LABELS[endgame]}</p>
    <p>No entry minimum. Repeated-Farkle penalties are unsupported in v1.</p>
    <p>Bot policy: {botPolicy} · Bank threshold: {botBankThreshold}</p>
    <p>Human turn clock: {defaults.decision_timer_seconds}s · Bot action delay: {defaults.bot_decision_delay_seconds}s</p>
    <table className="w-full text-sm"><caption className="text-left font-semibold">Approved scoring</caption><tbody>
      <tr><th className="text-left">Single 1 / 5</th><td>{scoring.singles['1']} / {scoring.singles['5']}</td></tr>
      {(['3', '4', '5', '6'] as const).map(n => <tr key={n}><th className="text-left">{n} of a kind (1–6)</th><td>{scoring.ofAKind[n].join(' / ')}</td></tr>)}
      {(['straight', 'threePairs', 'twoTriplets', 'fourPlusPair'] as const).map((rule, i) => <tr key={rule}><th className="text-left">{['Straight', 'Three pairs', 'Two triplets', 'Four + pair'][i]}</th><td>{scoring[rule]}</td></tr>)}
    </tbody></table>
    <p className="text-sm">The highest legal interpretation wins; four 1s score 1,100. Combinations never span rolls.</p>
    <p className="text-sm">Dealer setup contains only Stake, Target Score and Endgame. Each new game freezes its approved Admin Defaults.</p>
  </section>;
}
