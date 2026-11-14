import {useLayoutEffect, type RefObject} from 'react';
import {startDiceRollSound} from '@/lib/audio/diceRollSound';

/** The local tray animates HorsesDie directly, bypassing DiceRollAnimation. */
export function useYahtzeeRollSound(identity: string | null, rolling: boolean, active: boolean, surface: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    if (!identity || !rolling) return;
    return startDiceRollSound(identity, active ? surface.current : null);
  }, [identity, rolling, active, surface]);
}
