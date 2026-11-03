import {settings,type CourseConfig,type MegaRuleset,MEGA_ANYTIME_STAND_PAT_RULESET} from './config.js';
import {createRun,startNextHole,recoverHole,applyIntent,projectRun,type MegaRun,type Intent,type HoleResult} from './engine.js';

export const MEGA_HOLE_COUNTS=[3,6,9,18] as const;
export type MegaHoleCount=typeof MEGA_HOLE_COUNTS[number];
export interface MegaCompetitionConfig {version:MegaRuleset;course:CourseConfig}
export function competitionConfig(course:CourseConfig,holes:number,version:MegaRuleset=MEGA_ANYTIME_STAND_PAT_RULESET):MegaCompetitionConfig {
 if(!MEGA_HOLE_COUNTS.includes(holes as MegaHoleCount))throw Error('Choose 3, 6, 9 or 18 holes');
 if(!course.enabled)throw Error('Course unavailable');
 return {version,course:{...structuredClone(course),...settings({...course,holes})}};
}
export function startPlayerHole(id:string,actor:string,config:MegaCompetitionConfig,previous:MegaRun|null,decks:number[][]|null,at:number):MegaRun {
 if(previous){
  if(previous.id!==id||previous.owner!==actor||previous.ruleset!==config.version||JSON.stringify(previous.config)!==JSON.stringify(config.course))throw Error('Mega hole identity changed');
  return startNextHole(previous,at);
 }
 if(!decks)throw Error('Missing private decks');
 return createRun(id,actor,config.course,decks,at,config.version);
}
export function playPlayerHole(board:MegaRun,intent:Intent|{type:'tick'},at:number):MegaRun {
 if(board.phase==='scoring'||board.status!=='active')throw Error('The hole has ended');
 const recovered=recoverHole(board,at);
 if(intent.type==='tick'||recovered.revision!==board.revision)return recovered;
 if(intent.type==='abandon')throw Error('Use the match participation controls');
 return applyIntent(board,intent,at);
}
export function completedHole(board:MegaRun):HoleResult|null {
 return board.phase==='scoring'?board.results.find(r=>r.hole===board.hole)??null:null;
}
export function competitionWinner(totals:Record<string,number>):string[] {
 const entries=Object.entries(totals);
 if(!entries.length||entries.some(([,score])=>!Number.isSafeInteger(score)))throw Error('Invalid final scores');
 const lowest=Math.min(...entries.map(([,score])=>score));
 return entries.filter(([,score])=>score===lowest).map(([id])=>id);
}
export interface CompetitionResult {actor:string;hole:number;score:number;at:number}
export function megaStandings(players:readonly {id:string;name:string}[],results:readonly CompetitionResult[],holes:number){
 const rows=players.map(player=>{
  const seen=new Set<number>();
  const scores=Array.from({length:holes},()=>null as number|null);
  for(const r of results.filter(r=>r.actor===player.id)){
   if(!Number.isInteger(r.hole)||r.hole<1||r.hole>holes||!Number.isSafeInteger(r.score)||seen.has(r.hole))throw Error('Conflicting hole result');
   seen.add(r.hole);scores[r.hole-1]=r.score;
  }
  return {player,scores,thru:seen.size,total:scores.reduce<number>((n,score)=>n+(score??0),0)};
 }).sort((a,b)=>a.total-b.total||b.thru-a.thru||a.player.name.localeCompare(b.player.name));
 return rows.map((row,i)=>({...row,place:rows.findIndex(r=>r.total===row.total)+1}));
}
export {projectRun as projectPlayerHole};
