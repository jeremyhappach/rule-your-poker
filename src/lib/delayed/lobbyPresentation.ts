import type {ChildSummary,Home} from './client';
import {needsChildReview} from './reviews';
import {isAvailableTurn,turnDeadline} from './notifications';

// Only an explicit server-projected ACK admits the compact presentation.
export const isReviewedGame=(child:ChildSummary,userId:string)=>
 child.terminal&&child.viewed===true&&!needsChildReview(child,userId);

export function lobbyGameGroup(child:ChildSummary,home:Home,userId:string,now:number){
 if(isReviewedGame(child,userId))return 3;
 if(child.terminal)return 1;
 if(home.status==='active'&&!home.held&&!home.removedAt&&child.actor===userId&&Date.parse(child.expiresAt??'')>now)return 0;
 return 2;
}

export function orderedLobbyGames(home:Home,userId:string,now:number){
 return [...home.lineup].sort((a,b)=>lobbyGameGroup(a,home,userId,now)-lobbyGameGroup(b,home,userId,now)||a.ordinal-b.ordinal);
}

export function matchLobbyStatus(home:Home,userId:string,now:number){
 const opponent=home.players.find(player=>player.id!==userId);
 const results=home.lineup.filter(child=>needsChildReview(child,userId)).length;
 const turns=home.status==='active'&&!home.held
  ?home.lineup.filter(child=>isAvailableTurn(child,now))
  :[];
 const own=turns.filter(child=>child.actor===userId).length;
 const other=opponent?turns.filter(child=>child.actor===opponent.id).length:0;
 const invitation=home.status==='invited';
 const accepts=invitation&&home.opponent===userId;
 return {home,opponent:opponent?.name??'Opponent',own,other,results,invitation,accepts,
  actionable:accepts||own>0||results>0,nextDeadline:Math.min(...turns.map(turnDeadline))};
}

export function localInvitationTime(value:string){
 const date=new Date(value);
 const hour=date.getHours();
 return `${date.getMonth()+1}/${date.getDate()} ${hour%12||12}:${String(date.getMinutes()).padStart(2,'0')}${hour<12?'am':'pm'}`;
}
