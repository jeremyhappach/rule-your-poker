/** Pacing is frozen per match; card rules retain canasta-classic-two/1. */
export type CanastaMode = 'beginner' | 'expert';
export type CanastaConfig = {mode:CanastaMode;turnMs:number;timeoutPolicy:'complete-match'};
export interface CanastaDefaults {canasta_mode:CanastaMode;decision_timer_seconds:number}
export function canastaConfig(defaults:CanastaDefaults):CanastaConfig {
 if(!['beginner','expert'].includes(defaults.canasta_mode)||!Number.isInteger(defaults.decision_timer_seconds)||defaults.decision_timer_seconds<30||defaults.decision_timer_seconds>300)throw Error('Invalid Canasta pacing defaults');
 return {mode:defaults.canasta_mode,turnMs:defaults.canasta_mode==='beginner'?180000:defaults.decision_timer_seconds*1000,timeoutPolicy:'complete-match'};
}
/** Older admissions retain their original 120-second budget. */
export const turnBudget=(m:{config?:CanastaConfig})=>m.config?.turnMs??120000;
