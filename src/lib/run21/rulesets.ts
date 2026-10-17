import {DEFAULT_CONFIG,type Config} from './model.js';

/** Mode-neutral gameplay version. SQL registry is generated from this definition. */
export const RUN21_RULESET='run21/3';
const V2:Config={...DEFAULT_CONFIG,preset:'run21/2',clockStart:'intro_end',roundIntroMs:2500,
 speed:{start:280,decrement:2,intervalMs:420,bands:[{until:200,intervalMs:420},{until:0,intervalMs:900}]}};
export const RUN21_RULES:Config={...V2,preset:RUN21_RULESET,silverCelebrationMs:3000,goldCelebrationMs:3800};
export const RUN21_RULESETS:Record<string,Config>={'run21/2':V2,[RUN21_RULESET]:RUN21_RULES};
export function medalDuration(config:Config,aggregate:104|105){return aggregate===105?config.goldCelebrationMs??3800:config.silverCelebrationMs??2800;}
const ordered=(value:any):any=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
export function assertSharedRules(config:Config){
 const rules=RUN21_RULESETS[config.preset];
 if(!rules||JSON.stringify(ordered(Object.fromEntries(Object.keys(rules).map(k=>[k,config[k as keyof Config]]))))!==JSON.stringify(ordered(rules)))
  throw Error('run21:ruleset_conflict');
}
