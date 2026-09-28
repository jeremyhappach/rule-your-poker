import { type CSSProperties } from 'react';
import type { FarkleDie as Die } from '@/lib/farkle/types';
import { farkleStraightRow } from '@/lib/farkle/presentation';
import { FarkleDie } from './FarkleDie';
import './farkle.css';
import { useFarkleRollPhase, type FarkleRollPhase } from './useFarkleRollPhase';

export type { FarkleRollPhase } from './useFarkleRollPhase';
export interface FarkleRemoteHold {
  key: string;
  indexes: number[];
  phase: 'scoring' | 'dissolving' | 'retired';
}

/** Animation is presentation only; historical entry displays the settled row. */
export function FarkleRemoteStage({ dice, receiptKey, animate = false, previewPhase, retired = [], scoring = [], hold }: {
  dice: readonly Die[]; receiptKey: string; animate?: boolean; previewPhase?: FarkleRollPhase; retired?: number[]; scoring?: number[];
  hold?: FarkleRemoteHold;
}) {
  const phase = useFarkleRollPhase(receiptKey, animate && !previewPhase);
  const shown = previewPhase ?? phase;
  const orderedDice = farkleStraightRow(dice);
  const heldIndexes = new Set(hold?.indexes ?? []);
  const removingHeldDice = hold?.phase === 'dissolving' || hold?.phase === 'retired';
  const liveDice = removingHeldDice ? orderedDice.filter(die => !heldIndexes.has(die.index)) : orderedDice;
  const dissolvingDice = hold?.phase === 'dissolving' ? orderedDice.filter(die => heldIndexes.has(die.index)) : [];
  // The full current roll remains in dice after a Hold, so this visual map
  // outlives its held faces without ever using authoritative indexes as slots.
  const currentRollSlots = new Map(orderedDice.map((die, slot) => [die.index, slot]));
  const dieStyle = (die: Die, slot: number) => ({
    '--farkle-row-x': `${50 + (slot - (orderedDice.length - 1) / 2) * (100 / 6)}%`,
    '--farkle-cluster-x': `${40 + (die.index % 3) * 10}%`,
    '--farkle-cluster-y': `${38 + Math.floor(die.index / 3) * 24}%`,
  } as CSSProperties);
  return <div className="farkle-remote-stage" data-farkle-roll-phase={shown}
    data-farkle-fresh-roll={animate && !previewPhase || undefined} aria-label="Farkle dice">
    {liveDice.map(die => {
      const held = hold?.indexes.includes(die.index) ? hold : undefined;
      return <div key={`${receiptKey}/${die.index}`} className="farkle-remote-die"
        data-hold-phase={held?.phase} aria-hidden={held?.phase === 'dissolving' || undefined}
        style={dieStyle(die, currentRollSlots.get(die.index) ?? 0)}>
        <FarkleDie die={die} concealed={shown === 'cluster' || shown === 'rumble'} retired={!held && retired.includes(die.index)}
          scoring={held ? shown === 'reveal' || shown === 'row' : scoring.includes(die.index)} />
      </div>;
    })}
    {dissolvingDice.length > 0 && <div className="farkle-remote-hold-dissolving-layer" aria-hidden="true">
      {dissolvingDice.map(die => <div key={`${receiptKey}/dissolving/${die.index}`} className="farkle-remote-die"
        data-hold-phase="dissolving" aria-hidden="true" style={dieStyle(die, currentRollSlots.get(die.index) ?? 0)}>
        <FarkleDie die={die} scoring />
      </div>)}
    </div>}
  </div>;
}
