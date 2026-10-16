import {useId} from 'react';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {DEFAULT_CONFIG,type Config} from '@/lib/run21/model';
import {duration} from '@/lib/run21/rules';
import {qualificationThreshold} from '@/lib/run21/outcomePresentation';

type Props = {config?:Config; solo?:boolean};
/** Copy follows the supplied frozen configuration, never selects gameplay settings. */
export function Run21ScoringReference({config=DEFAULT_CONFIG,solo=false}:Props){
  return <div className="space-y-2 text-sm" data-run21-scoring-reference>
    <p>Place cards into {config.columns} columns. Aim for {config.target} in each without going over.</p>
    <p>Collect Win becomes available at total {qualificationThreshold(config)}+.</p>
    <dl className="grid grid-cols-3 gap-2" aria-label="Score multipliers">
      {Object.entries(config.multipliers).map(([total,multiplier])=><div key={total}><dt>{total}</dt><dd>{multiplier.toLocaleString()}×</dd></div>)}
    </dl>
    <p>Round score = multiplier × remaining speed bonus.</p>
    <p>{config.bust==='zero'&&config.expiration==='zero'?'Any bust or timer expiration scores 0.':(config.bust==='zero'?'A bust scores 0.':'A bust scores the current board.')+' '+(config.expiration==='zero'?'Timer expiration scores 0.':'Timer expiration scores the current board.')}</p>
    <p>{config.passes===1?'One Pass':config.passes+' Passes'} per round.</p>
    <p>The {duration(config)/1000}-second speed timer starts {config.clockStart==='intro_end'?'when the round introduction ends':'when you place your first card'}.</p>
    <p>Speed begins at {config.speed.start}. {config.speed.bands?.length
      ?config.speed.bands.map(band=>`Subtract ${config.speed.decrement} every ${band.intervalMs/1000} seconds down to ${band.until}.`).join(' ')
      :`Subtract ${config.speed.decrement} every ${config.speed.intervalMs/1000} ${config.speed.intervalMs===1000?'second':'seconds'}.`}</p>
    {config.clockStart!=='intro_end'&&<p>{config.firstPlacementSeconds!=null?`Place your first card within ${config.firstPlacementSeconds} seconds. `:''}{solo?'Missing the first-placement deadline ends the run unranked.':'A separate first-placement deadline applies to each new turn. If it expires, real-money sessions pause; fake-money players auto-complete and sit out the next hand.'}</p>}
    {solo&&<p>{config.rounds} rounds contribute to your run score. Abandoned runs are unranked.</p>}
  </div>;
}
/** Presentation state only: never dispatches an engine command or changes the clock. */
export function Run21ScoringHelp(props:Props){
  const title=useId();
  return <Popover><PopoverTrigger asChild><button type="button" aria-label="Run21 scoring help" title="Scoring help">?</button></PopoverTrigger>
    <PopoverContent side="bottom" align="end" aria-labelledby={title} className="run21-help-popover">
      <h2 id={title} className="mb-2 font-semibold">Run21 score multipliers</h2>
      <Run21ScoringReference {...props}/>
    </PopoverContent>
  </Popover>;
}
