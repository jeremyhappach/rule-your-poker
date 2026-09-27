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
  phase: 'scoring' | 'dissolving';
}

/** Animation is presentation only; historical entry displays the settled row. */
export function FarkleRemoteStage({ dice, receiptKey, animate = false, previewPhase, retired = [], scoring = [], hold }: {
  dice: readonly Die[]; receiptKey: string; animate?: boolean; previewPhase?: FarkleRollPhase; retired?: number[]; scoring?: number[];
  hold?: FarkleRemoteHold;
}) {
  const phase = useFarkleRollPhase(receiptKey, animate && !previewPhase);
  const shown = previewPhase ?? phase;
  return <div className="farkle-remote-stage" data-farkle-roll-phase={shown} aria-label="Farkle dice">
    {farkleStraightRow(dice).map((die, order) => {
      const held = hold?.indexes.includes(die.index) ? hold : undefined;
      return <div key={`${receiptKey}/${die.index}`} className="farkle-remote-die"
        data-hold-phase={held?.phase} aria-hidden={held?.phase === 'dissolving' || undefined}
        style={{ '--farkle-row-x': `${50 + (order - (dice.length - 1) / 2) * (100 / 6)}%`, '--farkle-cluster-x': `${40 + (die.index % 3) * 10}%`, '--farkle-cluster-y': `${38 + Math.floor(die.index / 3) * 24}%` } as CSSProperties}>
        <FarkleDie die={die} concealed={shown === 'cluster' || shown === 'rumble'} retired={!held && retired.includes(die.index)}
          scoring={held ? shown === 'reveal' || shown === 'row' : scoring.includes(die.index)} />
      </div>;
    })}
  </div>;
}
