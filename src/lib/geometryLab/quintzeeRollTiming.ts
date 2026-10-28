import {registerDomain,useDomainSnapshot} from './defaultsRegistry';

export const QUINTZEE_ROLL_TIMING_KEY='quintzee_roll_timing';
export const QUINTZEE_ROLL_TIMING_DEFAULTS={durationMs:1500};
export const QUINTZEE_ROLL_TIMING_BOUNDS={min:300,max:2500,step:50};
export type QuintzeeRollTiming=typeof QUINTZEE_ROLL_TIMING_DEFAULTS;
export function sanitizeQuintzeeRollTiming(raw:unknown):QuintzeeRollTiming {
 const n=(raw as Partial<QuintzeeRollTiming>|null)?.durationMs;
 const {min,max,step}=QUINTZEE_ROLL_TIMING_BOUNDS;
 return {durationMs:typeof n==='number'&&Number.isFinite(n)?Math.round(Math.max(min,Math.min(max,n))/step)*step:1500};
}
// Presentation only. Shared admin defaults use the existing registry/Apply flow.
registerDomain({key:QUINTZEE_ROLL_TIMING_KEY,defaults:QUINTZEE_ROLL_TIMING_DEFAULTS,sanitize:sanitizeQuintzeeRollTiming,firstPaintCacheKey:'quintzee-roll-timing-v1'});
export const useQuintzeeRollTiming=()=>useDomainSnapshot<QuintzeeRollTiming>(QUINTZEE_ROLL_TIMING_KEY);
