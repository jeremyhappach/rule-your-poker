import { type CSSProperties } from 'react';
import type { FarkleDie as Die } from '@/lib/farkle/types';
import { farkleStraightRow } from '@/lib/farkle/presentation';
import { FarkleDie } from './FarkleDie';
import './farkle.css';
import { useFarkleRollPhase, type FarkleRollPhase } from './useFarkleRollPhase';

export type { FarkleRollPhase } from './useFarkleRollPhase';

/** Animation is presentation only; historical entry displays the settled row. */
export function FarkleRemoteStage({ dice, receiptKey, animate = false, previewPhase, retired = [], scoring = [] }: {
  dice: readonly Die[]; receiptKey: string; animate?: boolean; previewPhase?: FarkleRollPhase; retired?: number[]; scoring?: number[];
}) {
  const phase = useFarkleRollPhase(receiptKey, animate && !previewPhase);
  const shown = previewPhase ?? phase;
  return <div className="farkle-remote-stage" data-farkle-roll-phase={shown} aria-label="Farkle dice">
    {farkleStraightRow(dice).map((die, order) => <div key={die.index} className="farkle-remote-die"
      style={{ '--farkle-row-x': `${50 + (order - (dice.length - 1) / 2) * (100 / 6)}%`, '--farkle-cluster-x': `${40 + (die.index % 3) * 10}%`, '--farkle-cluster-y': `${38 + Math.floor(die.index / 3) * 24}%` } as CSSProperties}>
      <FarkleDie die={die} concealed={shown === 'cluster' || shown === 'rumble'} retired={retired.includes(die.index)} scoring={scoring.includes(die.index)} />
    </div>)}
  </div>;
}
