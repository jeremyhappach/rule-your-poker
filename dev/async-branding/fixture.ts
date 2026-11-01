import type {Home} from '@/lib/delayed/client';
export const viewer='00000000-0000-4000-8000-000000000001';
export const opponent='00000000-0000-4000-8000-000000000002';
export const match='00000000-0000-4000-8000-000000000003';
export const games=['ptown-words','run21','tri-towers','quintzee','boxdrop'] as const;
const params=new URLSearchParams(location.search),state=params.get('state')??'mixed';
const now=Date.now();
export const home:Home={
  id:match,status:state==='invited'?'invited':state==='completed'?'settled':'active',revision:1,realMoney:true,
  offerHash:'local-only',organizer:viewer,opponent,players:[
    {id:viewer,name:params.has('long')?'AlexandraVeryLongPlayerNameWithoutSpaces':'Hap'},
    {id:opponent,name:params.has('long')?'Christopher Happach with a very long display name':'Happach Gmail'},
  ],createdAt:new Date(now).toISOString(),acceptedAt:state==='invited'?null:new Date(now).toISOString(),
  invitationExpiresAt:new Date(now+86400000).toISOString(),settledAt:null,held:state==='held',
  net:state==='completed'?15:0,completed:state==='completed'?5:0,exposure:17,receipt:state==='completed'?{}:null,
  reviewsComplete:state==='completed',serverAt:now,
  lineup:games.map((game,i)=>({
    id:`00000000-0000-4000-8000-00000000001${i}`,ordinal:i+1,game,stake:[5,1,5,1,5][i],config:{},
    starter:viewer,actor:state==='own'?viewer:state==='opponent'?opponent:i%3===0?opponent:viewer,
    segment:1,revision:1,terminal:['completed','forfeit','pending'].includes(state),availableAt:new Date(now).toISOString(),
    expiresAt:new Date(now+(state==='expired'?-60000:state==='last-call'?11*3600000:36*3600000)).toISOString(),
    lastCallAt:new Date(now+(state==='last-call'?-3600000:24*3600000)).toISOString(),startedAt:state==='resume'?new Date(now).toISOString():null,
    scores:{[viewer]:i===0?145:45780,[opponent]:state==='pending'?null:i===0?120:32500},
    pendingResults:{[opponent]:state==='pending'?1:0},progress:{[viewer]:'Next Round: 2',[opponent]:'Next Round: 1'},bagCount:86,
    viewed:state!=='pending',reviewId:state==='pending'?'local-review':undefined,
    result:['completed','forfeit'].includes(state)?{reason:state==='forfeit'?'timeout_forfeit':'normal',winner:i%2?opponent:viewer,delta:i%2?-5:5,at:new Date(now).toISOString()}:null,
  })),
};
const updates=new Set<()=>void>();
export const writes:{name:string;args:any}[]=[];
let preferences={invitations:true,asyncDefault:true,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'America/Chicago'};
let matchPush=true;
export const fixture={home,writes,update(patch:Partial<Home>){Object.assign(home,patch,{revision:home.revision+1,serverAt:Date.now()});updates.forEach(f=>f());}};
(window as any).asyncBrandingFixture=fixture;
export const supabase={
  async rpc(name:string,args:any={}){
    if(name==='delayed_home'||name==='delayed_history_detail')return {data:structuredClone(home),error:null};
    if(name==='delayed_list')return {data:[structuredClone(home)],error:null};
    if(name==='notification_preferences'){if(args.p_patch){writes.push({name,args});preferences={...preferences,...args.p_patch};}return {data:preferences,error:null};}
    if(name==='async_push_preference'){if(typeof args.p_enabled==='boolean'){writes.push({name,args});matchPush=args.p_enabled;}return {data:matchPush,error:null};}
    if(name==='delayed_respond'){writes.push({name,args});fixture.update({status:'cancelled'});return {data:null,error:null};}
    return {data:null,error:{message:'Unsupported local fixture RPC: '+name}};
  },
  channel(){let change:()=>void=()=>{};const channel={on(event:string,_filter:any,fn:()=>void){if(event==='postgres_changes')change=fn;return channel;},subscribe(status?:(s:string)=>void){updates.add(change);status?.('SUBSCRIBED');return channel;},presenceState(){return state==='live'?{fixture:[{presence_ref:'local-presence',beat:'local-beat'}]}:{};},track:async()=>{},untrack:async()=>{},unsubscribe(){updates.delete(change);}};return channel;},
  removeChannel(channel:{unsubscribe:()=>void}){channel.unsubscribe();},
  auth:{getSession:async()=>({data:{session:{user:{id:viewer},access_token:'local-only'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
};
