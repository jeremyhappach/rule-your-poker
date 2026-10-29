export interface ReviewEvent {
 id:string;kind:'attempt'|'child';actor:string|null;actorName?:string;round:number;score:number|null;at:string;
 receipt:{game:string;rules:any;result?:any;move?:any;reason?:string;winner?:string|null;stake?:number;organizerDelta?:number;opponentDelta?:number};
 board:any;seen:boolean;
}
export interface Reviews {events:ReviewEvent[];terminal:boolean;actor:string;segment:number;revision:number;started:boolean;expiresAt:string;held:boolean;serverAt:number}
export const money=(n:number)=>`${n<0?'−':n>0?'+':''}$${Math.abs(n).toLocaleString()}`;
export const turnTime=(expires:string|null,now:number)=>{
 const minutes=Math.max(0,Math.ceil((Date.parse(expires??'')-now)/60000));
 return Number.isFinite(minutes)?`${Math.floor(minutes/60)}h ${minutes%60}m`:'—';
};
export const reviewDuration=(reduced:boolean)=>reduced?1000:5000;
export const mayStart=(v:Reviews,user:string,segment:number,now:number,visible:boolean,online:boolean)=>
 visible&&online&&!v.held&&!v.terminal&&v.actor===user&&v.segment===segment&&!v.started&&Date.parse(v.expiresAt)>now;
