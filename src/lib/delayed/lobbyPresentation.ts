import type {ChildSummary,Home} from './client';
import {needsChildReview} from './reviews';

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
