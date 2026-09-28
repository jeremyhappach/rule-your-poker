import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import type { FarkleAction, FarkleState } from '@/lib/farkle/types';
import { selectedFarkleHold, type FarkleCommittedHold, type FarkleResolvedRoll } from '@/lib/farkle/presentation';
import { FarkleDie } from './FarkleDie';
import { useFarkleRollPhase } from './useFarkleRollPhase';
import type { FarkleBankActivation, FarkleBankInput } from '@/lib/farkle/bankProvenance';

export interface FarkleSelfHold {
  key: string;
  indexes: number[];
  phase: 'scoring' | 'dissolving' | 'retired';
  persistAfterDissolve?: boolean;
}

export function FarkleActiveArea({ state, controllable, pending, committed, onAction, animate = false, scoring = [], presentationHold, resolvedRoll }: {
  state: FarkleState; controllable: boolean; pending: boolean; committed: FarkleCommittedHold[];
  animate?: boolean; scoring?: number[]; presentationHold?: FarkleSelfHold; resolvedRoll?: FarkleResolvedRoll;
  onAction: (action: FarkleAction, selected?: number[], activation?: FarkleBankActivation) => void;
}) {
  const [selection, setSelection] = useState<{ key: string; indexes: number[] }>({ key: '', indexes: [] });
  const bankInput = useRef<FarkleBankInput | null>(null);
  const previousBankClick = useRef<number | null>(null);
  const key = resolvedRoll?.id ?? `${state._authorityScope}/${state.actionSequence}`;
  const phase = useFarkleRollPhase(resolvedRoll?.id ?? `${state._authorityScope}/${state.currentTurnPlayerId}/${state.rollNumber}`, !!resolvedRoll || animate);
  const selected = selection.key === key ? selection.indexes : [];
  useEffect(() => { setSelection({ key, indexes: [] }); }, [key]);
  const selectedHold = resolvedRoll ? null : selectedFarkleHold(state, selected);
  const presentationReady = !presentationHold || presentationHold.phase === 'retired';
  const enabled = !resolvedRoll && controllable && !pending && state.gamePhase === 'playing' && presentationReady;
  const rollAllowed = enabled && (state.stage === 'roll' || state.stage === 'bank_or_roll');
  const latestRoll = !resolvedRoll && animate
    ? state.events?.find(event => event.type === 'dice_rolled' && event.playerId === state.currentTurnPlayerId)
    : undefined;
  const freshRollDice = resolvedRoll?.dice ?? latestRoll?.dice;
  const dice = freshRollDice ?? state.dice;
  const isFreshRoll = !!freshRollDice;
  const consolidated = !resolvedRoll && committed.some(group => state.rollNumber > group.rollNumber);
  const heldIndexes = presentationHold?.indexes ?? [];
  const holdIsAcknowledging = presentationHold?.phase === 'scoring';
  // Terminal receipts keep their exact roll. A live self row contains only dice
  // still available in the current scoring cycle; held dice live briefly in the
  // receipt-bound acknowledgment layer instead of occupying gray slots.
  const visibleDice = resolvedRoll
    ? dice
    : holdIsAcknowledging
      ? dice
      : dice.filter(die => state.available.includes(die.index) && !heldIndexes.includes(die.index));
  const dissolvingDice = !resolvedRoll && presentationHold?.phase === 'dissolving'
    ? dice.filter(die => heldIndexes.includes(die.index))
    : [];
  return <div className="flex h-full min-h-0 flex-col gap-1 px-2 text-foreground" data-farkle-active-area="" data-farkle-resolved-roll={resolvedRoll?.id}>
    <strong className="shrink-0 text-center text-sm">THIS TURN {state.thisTurn.toLocaleString('en-US')}</strong>
    <div className="farkle-self-dice" data-farkle-self-roll-phase={phase} data-held-consolidated={consolidated}
      data-farkle-self-hold-phase={presentationHold?.phase}>
        {visibleDice.map((die, slot) => {
          const index = die.index;
          return <FarkleDie key={index} die={die} selected={selected.includes(index)}
            style={{ '--farkle-self-slot-x': `${50 + ((isFreshRoll ? slot - (visibleDice.length - 1) / 2 : index - 2.5) * (100 / 6))}%` } as CSSProperties}
            scoring={!resolvedRoll && (holdIsAcknowledging ? heldIndexes.includes(index) : scoring.includes(index))}
            disabled={!enabled || state.stage !== 'hold' || !state.available.includes(index)}
            onSelect={i => setSelection({ key, indexes: selected.includes(i) ? selected.filter(n => n !== i) : [...selected, i] })} />;
        })}
        {dissolvingDice.length > 0 && <div className="farkle-self-hold-dissolving-layer" aria-hidden="true">
          {dissolvingDice.map(die => <span key={die.index} className="farkle-self-hold-dissolving"
            style={{ '--farkle-self-hold-x': `${50 + (die.index - 2.5) * (100 / 6)}%` } as CSSProperties}>
            <FarkleDie die={die} scoring />
          </span>)}
        </div>}
    </div>
    <div aria-label="Committed scoring dice" data-held-consolidated={consolidated} className="flex shrink-0 items-center justify-start gap-2 overflow-x-auto text-xs text-foreground">
      {committed.length ? committed.map(group => <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap" key={group.sequence}>
        {consolidated ? <span className="farkle-committed-dice">{group.dice.map(die => <FarkleDie key={`${group.sequence}/${die.index}`} die={die} />)}</span>
          : <span>{group.dice.map(d => d.value).join(' · ')}</span>}
        <span>+{group.points.toLocaleString('en-US')}</span>
      </span>) : <span>No dice held this turn</span>}
    </div>
    <div className={`flex h-10 shrink-0 justify-center gap-2 pb-1${presentationReady ? '' : ' invisible pointer-events-none'}`}
      aria-hidden={!presentationReady} data-farkle-self-action-slot="" data-farkle-actions-ready={presentationReady}>
      <Button size="sm" disabled={!enabled || !selectedHold} onClick={() => onAction('hold', selected)}>Hold Dice{selectedHold ? ` +${selectedHold.points}` : ''}</Button>
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
