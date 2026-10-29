import type {Home} from './client';
export type NotificationEvent={id:string;revision:number;read_revision:number;actionable:boolean};
export const pendingNoticeKeys=(items:NotificationEvent[])=>items.filter(n=>n.actionable||n.read_revision<n.revision).map(n=>`${n.id}:${n.revision}`).sort();
export function turnDestination(home:Home,userId:string){
 const turns=home.status==='active'&&!home.held?home.lineup.filter(c=>!c.terminal&&c.actor===userId&&Date.parse(c.expiresAt??'')>home.serverAt):[];
 return turns.length===1?`/delayed/${home.id}/play/${turns[0].id}`:`/delayed/${home.id}`;
}

/** Route state is a presentation hint only. Every authority/release check still runs. */
export function turnEntryHint(home:Home,childId:string,userId:string){
 const child=home.lineup.find(c=>c.id===childId),opponent=home.players.find(p=>p.id!==userId);
 return {asyncEntry:{matchId:home.id,childId,opponentName:opponent?.name,reviewPending:!!opponent&&!!child?.pendingResults?.[opponent.id]&&!child.startedAt}};
}
