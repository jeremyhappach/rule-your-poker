export const WORDS_TURN_SECONDS={min:30,max:3600,initial:300} as const;
export const validWordsTurnSeconds=(value:number)=>Number.isInteger(value)&&value>=WORDS_TURN_SECONDS.min&&value<=WORDS_TURN_SECONDS.max;
