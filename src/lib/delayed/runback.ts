import type {Home} from './client';
import {competitionConfig,type MegaCompetitionConfig} from '@/lib/megaCardGolf/competition';
import type {CourseConfig} from '@/lib/megaCardGolf/config';

export type InvitePerson={id:string;name:string;isHuman:boolean};
export type InviteEntry={key:string;game:string;stake:string;config?:unknown};
export type Capabilities={enabled:boolean;fake_money_only:boolean;max_children:number;games:{id:string;stake?:number;realQualified?:boolean;rules?:unknown;courses?:CourseConfig[]}[]};
export type RunbackDraft={source:string;lineup:InviteEntry[];opponent:InvitePerson;realMoney:boolean;policyVersion:string;submission?:Record<string,unknown>;sent?:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function runbackUrl(matchId:string,returnTo:string,draftId=crypto.randomUUID()){
 return '/delayed/new?'+new URLSearchParams({runback:matchId,draft:draftId,return:runbackReturn(returnTo,matchId)});
}
export function runbackReturn(value:string|null,matchId:string){
 return value==='/?sessions=completed'||value==='/delayed'?value:
  value==='/delayed/'+matchId+'?finale=1'?value:'/?sessions=completed';
}
export const validDraftId=(id:string|null):id is string=>!!id&&uuid.test(id);
export function reconstructRunback(home:Home,userId:string):RunbackDraft{
 if(home.status!=='settled'||!home.receipt||![home.organizer,home.opponent].includes(userId)||!home.lineup.length)throw Error('This completed match is unavailable.');
 const id=home.organizer===userId?home.opponent:home.organizer;
 return {source:home.id,realMoney:home.realMoney,policyVersion:home.policyVersion??'unknown',
  opponent:{id,name:home.players.find(p=>p.id===id)?.name??'Original opponent',isHuman:home.opponentEligible===true},
  lineup:[...home.lineup].sort((a,b)=>a.ordinal-b.ordinal).map(c=>({key:crypto.randomUUID(),game:c.game,stake:String(c.stake),config:structuredClone(c.config??null)}))};
}
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value)??'undefined';
}
export function configurationIssue(entry:InviteEntry,caps:Capabilities):string|null{
 const supported=caps.games.find(g=>g.id===entry.game);
 if(!supported)return 'This game is no longer available. Choose another game or remove it.';
 if(entry.game==='crib-lab'&&entry.config&&typeof entry.config==='object'){
  const saved=entry.config as Record<string,unknown>,current=supported.rules as Record<string,unknown>;
  if(typeof saved.sharedDeck==='boolean'&&canonical(saved)===canonical({...current,sharedDeck:saved.sharedDeck}))return null;
 }
 if(entry.game==='mega-card-golf'&&entry.config!==undefined){
  try{
   const saved=entry.config as MegaCompetitionConfig,current=supported.rules as MegaCompetitionConfig,course=supported.courses?.find(c=>c.id===saved.course.id);
   if(course&&saved.version===current.version&&canonical(saved)===canonical(competitionConfig(course,saved.course.holes,current.version)))return null;
  }catch{/* The generic saved-configuration explanation below keeps the draft. */}
 }
 if(entry.config!==undefined&&canonical(entry.config)!==canonical(supported.rules)){
  const old=entry.config as {version?:string;id?:string}|null;
  const current=supported.rules as Record<string,unknown>|null;
  const saved=entry.config as Record<string,unknown>|null;
  const changed=[...new Set([...Object.keys(saved??{}),...Object.keys(current??{})])].filter(key=>canonical(saved?.[key])!==canonical(current?.[key]));
  const labels=changed.map(key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')).join(', ');
  return 'The saved '+(old?.version??old?.id??'gameplay configuration')+' is not available for new invitations. '+(labels?'Different settings: '+labels+'. ':'')+'Keep the saved settings until you explicitly choose current rules, another game, or remove this game.';
 }
 return null;
}
const storageKey=(user:string,draft:string)=>'async-runback:v1:'+user+':'+draft;
export function readRunback(user:string,id:string,source:string):RunbackDraft|null{
 const raw=sessionStorage.getItem(storageKey(user,id));if(!raw)return null;
 const draft=JSON.parse(raw) as RunbackDraft;
 if(draft.source!==source||typeof draft.realMoney!=='boolean'||typeof draft.policyVersion!=='string'||!Array.isArray(draft.lineup)||!draft.lineup.length||
  !draft.lineup.every(c=>c&&typeof c.key==='string'&&typeof c.game==='string'&&typeof c.stake==='string'&&Object.prototype.hasOwnProperty.call(c,'config'))||
  !draft.opponent||typeof draft.opponent.id!=='string'||typeof draft.opponent.name!=='string'||typeof draft.opponent.isHuman!=='boolean'||
  (draft.submission&&(draft.submission.p_request!==id||typeof draft.submission.p_opponent!=='string'||typeof draft.submission.p_real_money!=='boolean'||!Array.isArray(draft.submission.p_lineup))))
  throw Error('The saved draft could not be restored. Reopen Run It Back from the completed match.');
 return draft;
}
export function saveRunback(user:string,id:string,draft:RunbackDraft){
 try{sessionStorage.setItem(storageKey(user,id),JSON.stringify(draft));}
 catch{throw Error('Unable to save this draft safely. Enable browser storage before sending.');}
}
