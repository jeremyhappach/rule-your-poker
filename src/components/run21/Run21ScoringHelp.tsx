import {useId} from 'react';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {DEFAULT_CONFIG} from '@/lib/run21/model';

export function Run21ScoringReference(){
  return <div className="space-y-2 text-sm" data-run21-scoring-reference>
    <p>Collect Win becomes available at total 97+.</p>
    <dl className="grid grid-cols-3 gap-2" aria-label="Score multipliers">
      {Object.entries(DEFAULT_CONFIG.multipliers).map(([total,multiplier])=><div key={total}><dt>{total}</dt><dd>{multiplier.toLocaleString()}×</dd></div>)}
    </dl>
    <p>Round score = multiplier × remaining speed bonus.</p>
    <p>Any bust or timer expiration scores 0.</p>
    <p>One Pass per round.</p>
    <p>The timer starts when you place your first card. Once started, it continues while this reference is open.</p>
  </div>;
}
/** Presentation state only: never dispatches an engine command or changes the clock. */
export function Run21ScoringHelp(){
  const title=useId();
  return <Popover><PopoverTrigger asChild><button type="button" aria-label="Run21 scoring help" title="Scoring help">?</button></PopoverTrigger>
    <PopoverContent side="bottom" align="end" aria-labelledby={title} className="run21-help-popover">
      <h2 id={title} className="mb-2 font-semibold">Run21 score multipliers</h2>
      <Run21ScoringReference/>
    </PopoverContent>
  </Popover>;
}
