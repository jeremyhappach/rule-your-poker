import { useEffect, useState, type CSSProperties } from 'react';
import type { FarkleDie as Die } from '@/lib/farkle/types';
import { farkleStraightRow } from '@/lib/farkle/presentation';
import { FarkleDie } from './FarkleDie';
import './farkle.css';

export type FarkleRollPhase = 'cluster' | 'rumble' | 'reveal' | 'row';

/** Animation is presentation only; historical entry displays the settled row. */
export function FarkleRemoteStage({ dice, receiptKey, animate = false, previewPhase }: {
  dice: readonly Die[]; receiptKey: string; animate?: boolean; previewPhase?: FarkleRollPhase;
}) {
  const [phase, setPhase] = useState<FarkleRollPhase>('row');
  useEffect(() => {
    if (!animate || previewPhase) { setPhase('row'); return; }
    setPhase('cluster');
    const timers = [setTimeout(() => setPhase('rumble'), 180), setTimeout(() => setPhase('reveal'), 600), setTimeout(() => setPhase('row'), 850)];
    return () => timers.forEach(clearTimeout);
  }, [receiptKey, animate, previewPhase]);
  const shown = previewPhase ?? phase;
  return <div className="farkle-remote-stage" data-farkle-roll-phase={shown} aria-label="Farkle dice">
    {farkleStraightRow(dice).map((die, order) => <div key={die.index} className="farkle-remote-die"
      style={{ '--farkle-row-x': `${(order + .5) * (100 / Math.max(dice.length, 1))}%`, '--farkle-cluster-x': `${40 + (die.index % 3) * 10}%`, '--farkle-cluster-y': `${38 + Math.floor(die.index / 3) * 24}%` } as CSSProperties}>
      <FarkleDie die={die} concealed={shown === 'cluster' || shown === 'rumble'} />
    </div>)}
  </div>;
}
