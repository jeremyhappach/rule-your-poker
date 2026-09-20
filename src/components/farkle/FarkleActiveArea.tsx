import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FarkleAction, FarkleState } from '@/lib/farkle/types';
import { selectedFarkleHold, type FarkleCommittedHold } from '@/lib/farkle/presentation';
import { FarkleDie } from './FarkleDie';

export function FarkleActiveArea({ state, controllable, pending, committed, onAction }: {
  state: FarkleState; controllable: boolean; pending: boolean; committed: FarkleCommittedHold[];
  onAction: (action: FarkleAction, selected?: number[]) => void;
}) {
  const [selection, setSelection] = useState<{ key: string; indexes: number[] }>({ key: '', indexes: [] });
  const key = `${state._authorityScope}/${state.actionSequence}`;
  const selected = selection.key === key ? selection.indexes : [];
  useEffect(() => { setSelection({ key, indexes: [] }); }, [key]);
  const hold = selectedFarkleHold(state, selected);
  const enabled = controllable && !pending && state.gamePhase === 'playing';
  const rollAllowed = enabled && (state.stage === 'roll' || state.stage === 'bank_or_roll');
  return <div className="flex h-full min-h-0 flex-col gap-1 px-2" data-farkle-active-area="">
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="grid w-full max-w-sm grid-cols-6 gap-1">
        {Array.from({ length: 6 }, (_, index) => {
          const die = state.dice.find(d => d.index === index);
          return die ? <FarkleDie key={index} die={die} selected={selected.includes(index)}
            disabled={!enabled || state.stage !== 'hold' || !state.available.includes(index)}
            onSelect={i => setSelection({ key, indexes: selected.includes(i) ? selected.filter(n => n !== i) : [...selected, i] })} />
            : <FarkleDie key={index} die={{ index, value: 0 }} concealed />;
        })}
      </div>
    </div>
    <div aria-label="Committed scoring dice" className="flex shrink-0 gap-2 overflow-x-auto text-xs text-amber-100">
      {committed.length ? committed.map(group => <span className="whitespace-nowrap" key={group.sequence}>
        {group.dice.map(d => d.value).join(' · ')} +{group.points}
      </span>) : <span>No dice held this turn</span>}
    </div>
    <div className="flex shrink-0 justify-center gap-2 pb-1">
      <Button size="sm" disabled={!enabled || !hold} onClick={() => onAction('hold', selected)}>Hold Dice{hold ? ` +${hold.points}` : ''}</Button>
      <Button size="sm" disabled={!enabled || state.stage !== 'bank_or_roll'} onClick={() => onAction('bank')}>Bank</Button>
      <Button size="sm" disabled={!rollAllowed} onClick={() => onAction('roll')}>Roll {state.available.length}</Button>
    </div>
  </div>;
}
