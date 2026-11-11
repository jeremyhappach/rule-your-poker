import type {ChildSummary,Home} from './client';
export type NotificationEvent={id:string;revision:number;read_revision:number;actionable:boolean};
export const pendingNoticeKeys=(items:NotificationEvent[])=>items.filter(n=>n.actionable||n.read_revision<n.revision).map(n=>`${n.id}:${n.revision}`).sort();
export const turnDeadline=(child:ChildSummary)=>Date.parse(child.playableDeadline??child.expiresAt??'');
export const isAvailableTurn=(child:ChildSummary,now:number)=>!child.terminal&&child.playable!==false&&turnDeadline(child)>now;

export function turnDestination(home:Home,userId:string){
 const turns=home.status==='active'&&!home.held?home.lineup.filter(c=>c.actor===userId&&isAvailableTurn(c,home.serverAt)):[];
 return turns.length===1?`/delayed/${home.id}/play/${turns[0].id}`:`/delayed/${home.id}`;
}

export function compactTurnTime(deadline:string|null|undefined,now:number){
 const remaining=Date.parse(deadline??'')-now;
 if(!Number.isFinite(remaining))return '';
 return `${remaining>=3600000?Math.ceil(remaining/3600000)+'h':Math.max(0,Math.ceil(remaining/60000))+'m'} left`;
}

/** Route state is a presentation hint only. Every authority/release check still runs. */
export function turnEntryHint(home:Home,childId:string,userId:string){
 const child=home.lineup.find(c=>c.id===childId),opponent=home.players.find(p=>p.id!==userId);
 return {asyncEntry:{matchId:home.id,childId,opponentName:opponent?.name,reviewPending:!!opponent&&!!child?.pendingResults?.[opponent.id]&&!child.startedAt}};
}
