import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FarkleAction, FarkleState } from '@/lib/farkle/types';
import { selectedFarkleHold, type FarkleCommittedHold, type FarkleResolvedRoll } from '@/lib/farkle/presentation';
import { FarkleDie } from './FarkleDie';
import { useFarkleRollPhase } from './useFarkleRollPhase';

export function FarkleActiveArea({ state, controllable, pending, committed, onAction, animate = false, retired = [], scoring = [], resolvedRoll }: {
  state: FarkleState; controllable: boolean; pending: boolean; committed: FarkleCommittedHold[];
  animate?: boolean; retired?: number[]; scoring?: number[]; resolvedRoll?: FarkleResolvedRoll;
  onAction: (action: FarkleAction, selected?: number[]) => void;
}) {
  const [selection, setSelection] = useState<{ key: string; indexes: number[] }>({ key: '', indexes: [] });
  const key = resolvedRoll?.id ?? `${state._authorityScope}/${state.actionSequence}`;
  const phase = useFarkleRollPhase(resolvedRoll?.id ?? `${state._authorityScope}/${state.currentTurnPlayerId}/${state.rollNumber}`, !!resolvedRoll || animate);
  const selected = selection.key === key ? selection.indexes : [];
  useEffect(() => { setSelection({ key, indexes: [] }); }, [key]);
  const hold = resolvedRoll ? null : selectedFarkleHold(state, selected);
  const enabled = !resolvedRoll && controllable && !pending && state.gamePhase === 'playing';
  const rollAllowed = enabled && (state.stage === 'roll' || state.stage === 'bank_or_roll');
  const dice = resolvedRoll?.dice ?? state.dice;
  return <div className="flex h-full min-h-0 flex-col gap-1 px-2 text-foreground" data-farkle-active-area="" data-farkle-resolved-roll={resolvedRoll?.id}>
    <strong className="shrink-0 text-center text-sm">THIS TURN {state.thisTurn.toLocaleString('en-US')}</strong>
    <div className="farkle-self-dice" data-farkle-self-roll-phase={phase}>
        {Array.from({ length: 6 }, (_, index) => {
          const die = dice.find(d => d.index === index);
          return die ? <FarkleDie key={index} die={die} selected={selected.includes(index)}
            retired={!resolvedRoll && retired.includes(index)} scoring={!resolvedRoll && scoring.includes(index)}
            disabled={!enabled || state.stage !== 'hold' || !state.available.includes(index)}
            onSelect={i => setSelection({ key, indexes: selected.includes(i) ? selected.filter(n => n !== i) : [...selected, i] })} />
            : <FarkleDie key={index} die={{ index, value: 0 }} concealed retired={!resolvedRoll && !state.available.includes(index)} />;
        })}
    </div>
    <div aria-label="Committed scoring dice" className="flex shrink-0 gap-2 overflow-x-auto text-xs text-foreground">
      {committed.length ? committed.map(group => <span className="whitespace-nowrap" key={group.sequence}>
        {group.dice.map(d => d.value).join(' · ')} +{group.points.toLocaleString('en-US')}
      </span>) : <span>No dice held this turn</span>}
    </div>
    <div className="flex shrink-0 justify-center gap-2 pb-1">
      <Button size="sm" disabled={!enabled || !hold} onClick={() => onAction('hold', selected)}>Hold Dice{hold ? ` +${hold.points}` : ''}</Button>
      <Button size="sm" disabled={!enabled || state.stage !== 'bank_or_roll'} onClick={() => onAction('bank')}>Bank</Button>
      <Button size="sm" disabled={!rollAllowed} onClick={() => onAction('roll')}>Roll {state.available.length}</Button>
    </div>
  </div>;
}
