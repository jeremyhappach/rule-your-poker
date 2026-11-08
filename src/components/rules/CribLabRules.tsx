import type {RuleRendererProps} from '@/lib/gameCatalog/types';

export default function CribLabRules({config,version}:RuleRendererProps){
  const seconds=((config as {durationMs?:number})?.durationMs??240000)/1000;
  const polished=String((config as {version?:string})?.version??version).startsWith('crib-lab/2');
  return <article>
    <h3>How to play</h3>
    <p>Build five cribbage hands against the clock. Play three rounds. Each round starts with a fresh deck and {seconds} seconds.</p>
    <ol>
      <li><strong>Discard.</strong> Mark two cards in each row. Tap a marked card to undo it. Lock all five hands together.</li>
      <li><strong>Stock.</strong> See five offers, one at a time. Tap a kept card to replace it or pass. Each offer is used once. The badge counts the remaining offers, including the card you see.</li>
      <li><strong>Cut.</strong> Reveal the shared starter. It counts with each of your five hands.</li>
      <li><strong>Swap.</strong> Pick one card in each of two different hands, then confirm or cancel. Make up to three exchanges. To stand pat with cards selected, cancel the selection first.</li>
    </ol>
    <h3>What scores</h3>
    <p>Each fifteen scores 2. Face cards count as ten and an ace as one. Every pair scores 2. Each longest run of at least three scores its length, including distinct runs made with duplicate ranks. Four suited hand cards score 4, or 5 with a matching starter. A jack in hand matching the starter’s suit scores 1.</p>
    {polished&&<p>Decision time pauses for the three phase introductions, the cut reveal and scoring. During the count, follow the highlighted cards in each hand and the shared starter. Each distinct fifteen, pair and longest run counts separately.</p>}
    <p>Add all five hand scores, then multiply by ×100 to ×300 according to the time left. Half the clock gives ×200. At expiry, marked discards stay selected, missing discards come from the right, remaining offers pass, and only confirmed swaps count. An expired round uses ×100.</p>
  </article>;
}
