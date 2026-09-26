import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FarkleAction, FarkleState } from '@/lib/farkle/types';
import { selectedFarkleHold, type FarkleCommittedHold, type FarkleResolvedRoll } from '@/lib/farkle/presentation';
import { FarkleDie } from './FarkleDie';
import { useFarkleRollPhase } from './useFarkleRollPhase';
import type { FarkleBankActivation, FarkleBankInput } from '@/lib/farkle/bankProvenance';

export function FarkleActiveArea({ state, controllable, pending, committed, onAction, animate = false, retired = [], scoring = [], resolvedRoll }: {
  state: FarkleState; controllable: boolean; pending: boolean; committed: FarkleCommittedHold[];
  animate?: boolean; retired?: number[]; scoring?: number[]; resolvedRoll?: FarkleResolvedRoll;
  onAction: (action: FarkleAction, selected?: number[], activation?: FarkleBankActivation) => void;
}) {
  const [selection, setSelection] = useState<{ key: string; indexes: number[] }>({ key: '', indexes: [] });
  const bankInput = useRef<FarkleBankInput | null>(null);
  const previousBankClick = useRef<number | null>(null);
  const key = resolvedRoll?.id ?? `${state._authorityScope}/${state.actionSequence}`;
  const phase = useFarkleRollPhase(resolvedRoll?.id ?? `${state._authorityScope}/${state.currentTurnPlayerId}/${state.rollNumber}`, !!resolvedRoll || animate);
  const selected = selection.key === key ? selection.indexes : [];
  useEffect(() => { setSelection({ key, indexes: [] }); }, [key]);
  const hold = resolvedRoll ? null : selectedFarkleHold(state, selected);
  const enabled = !resolvedRoll && controllable && !pending && state.gamePhase === 'playing';
  const rollAllowed = enabled && (state.stage === 'roll' || state.stage === 'bank_or_roll');
  const dice = resolvedRoll?.dice ?? state.dice;
  const consolidated = !resolvedRoll && committed.some(group => state.rollNumber > group.rollNumber);
  // A terminal receipt is the exact roll that happened. Keep its count intact
  // until the canonical FARKLE notice retires it; only live turns use six slots.
  const visibleDice = resolvedRoll
    ? dice
    : consolidated
      ? dice
      : Array.from({ length: 6 }, (_, index) => dice.find(d => d.index === index) ?? { index, value: 0 });
  return <div className="flex h-full min-h-0 flex-col gap-1 px-2 text-foreground" data-farkle-active-area="" data-farkle-resolved-roll={resolvedRoll?.id}>
    <strong className="shrink-0 text-center text-sm">THIS TURN {state.thisTurn.toLocaleString('en-US')}</strong>
    <div className="farkle-self-dice" data-farkle-self-roll-phase={phase} data-held-consolidated={consolidated}>
        {visibleDice.map(die => {
          const index = die.index;
          return die.value ? <FarkleDie key={index} die={die} selected={selected.includes(index)}
            retired={!resolvedRoll && retired.includes(index)} scoring={!resolvedRoll && scoring.includes(index)}
            disabled={!enabled || state.stage !== 'hold' || !state.available.includes(index)}
            onSelect={i => setSelection({ key, indexes: selected.includes(i) ? selected.filter(n => n !== i) : [...selected, i] })} />
            : <FarkleDie key={index} die={{ index, value: 0 }} concealed retired={!resolvedRoll && !state.available.includes(index)} />;
        })}
    </div>
    <div aria-label="Committed scoring dice" data-held-consolidated={consolidated} className="flex shrink-0 items-center justify-start gap-2 overflow-x-auto text-xs text-foreground">
      {committed.length ? committed.map(group => <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap" key={group.sequence}>
        {consolidated ? <span className="farkle-committed-dice">{group.dice.map(die => <FarkleDie key={`${group.sequence}/${die.index}`} die={die} />)}</span>
          : <span>{group.dice.map(d => d.value).join(' · ')}</span>}
        <span>+{group.points.toLocaleString('en-US')}</span>
      </span>) : <span>No dice held this turn</span>}
    </div>
    <div className="flex shrink-0 justify-center gap-2 pb-1">
      <Button size="sm" disabled={!enabled || !hold} onClick={() => onAction('hold', selected)}>Hold Dice{hold ? ` +${hold.points}` : ''}</Button>
      <Button size="sm" disabled={!enabled || state.stage !== 'bank_or_roll'}
        onPointerDown={event => { bankInput.current = {
          eventType: event.type, clientTimestamp: new Date().toISOString(), eventTimestamp: event.timeStamp,
          sequence: state.actionSequence, rollNumber: state.rollNumber, scoringCycle: state.scoringCycle,
          pointerType: event.pointerType || null, key: null, repeatedKey: false,
        }; }}
        onKeyDown={event => { bankInput.current = ['Enter', ' '].includes(event.key) ? {
          eventType: event.type, clientTimestamp: new Date().toISOString(), eventTimestamp: event.timeStamp,
          sequence: state.actionSequence, rollNumber: state.rollNumber, scoringCycle: state.scoringCycle,
          pointerType: null, key: event.key, repeatedKey: event.repeat,
        } : null; }}
        onBlur={() => { bankInput.current = null; }}
        onClick={event => {
          const button = event.currentTarget;
          const bounds = button.getBoundingClientRect();
          const activation: FarkleBankActivation = {
            source: 'bank_button', clientTimestamp: new Date().toISOString(),
            eventType: event.type, trusted: event.isTrusted, clickDetail: event.detail,
            webdriver: navigator.webdriver === true,
            pointerType: 'pointerType' in event.nativeEvent ? String(event.nativeEvent.pointerType) || null : null,
            key: bankInput.current?.key ?? null, visible: bounds.width > 0 && bounds.height > 0,
            enabled: !button.disabled, focused: document.activeElement === button,
            eventTimestamp: event.timeStamp, previousClickTimestamp: previousBankClick.current,
            input: bankInput.current,
          };
          bankInput.current = null;
          previousBankClick.current = event.timeStamp;
          onAction('bank', [], activation);
        }}>Bank</Button>
      <Button size="sm" disabled={!rollAllowed} onClick={() => onAction('roll')}>Roll {state.available.length}</Button>
    </div>
  </div>;
}
