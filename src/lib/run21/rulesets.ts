import {DEFAULT_CONFIG,type Config} from './model.js';

/** Mode-neutral gameplay version. SQL registry is generated from this definition. */
export const RUN21_RULESET='run21/2';
export const RUN21_RULES:Config={...DEFAULT_CONFIG,preset:RUN21_RULESET,clockStart:'intro_end',roundIntroMs:2500,
 speed:{start:280,decrement:2,intervalMs:420,bands:[{until:200,intervalMs:420},{until:0,intervalMs:900}]}};
export const RUN21_RULESETS:Record<string,Config>={[RUN21_RULESET]:RUN21_RULES};
const ordered=(value:any):any=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
export function assertSharedRules(config:Config){
 const rules=RUN21_RULESETS[config.preset];
 if(!rules||JSON.stringify(ordered(Object.fromEntries(Object.keys(rules).map(k=>[k,config[k as keyof Config]]))))!==JSON.stringify(ordered(rules)))
  throw Error('run21:ruleset_conflict');
}
