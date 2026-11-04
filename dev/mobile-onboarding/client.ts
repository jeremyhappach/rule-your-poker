const id='11111111-1111-4111-8111-111111111111';
const config=(window as any).fixture??{};
(window as any).calls=[];(window as any).permissionCalls=0;
let signedIn=!config.signedOut;
const listeners=new Set<Function>();
const session=()=>signedIn?{access_token:'fixture-only',user:{id},expires_at:Date.now()/1000+3600}:null;
export const supabase={
 auth:{getSession:async()=>({data:{session:session()}}),onAuthStateChange:(fn:Function)=>{listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};},signOut:async()=>{signedIn=false;for(const fn of listeners)fn('SIGNED_OUT',null);return {error:null};},signInWithPassword:async()=>{(window as any).fixtureLogin();return {data:{session:session()},error:null};}},
 from:(table:string)=>{const value=table==='profiles'?{username:'Player',is_superuser:false}:table==='user_roles'?config.admin?{role:'admin'}:null:table==='system_settings'?[]:null;
  const q:any=new Proxy({}, {get:(_target,key)=>key==='then'?(resolve:Function)=>Promise.resolve({data:value,error:null}).then(resolve as never):()=>q});return q;},
 rpc:async(name:string,args:any={})=>{
  (window as any).calls.push({name,args});let data:any=null;
  if(name==='mobile_onboarding_preference'){
   let prefs=JSON.parse(localStorage.getItem('fixture:prefs')??'null')??config.preference??{};
   if(args.p_action==='snooze')prefs={...prefs,snoozedUntil:Date.now()+7*86400000};
   if(args.p_action==='dismiss')prefs={...prefs,dismissed:true};
   if(args.p_action==='complete')prefs={...prefs,completed:true};
   if(['snooze','dismiss','complete'].includes(args.p_action))localStorage.setItem('fixture:prefs',JSON.stringify(prefs));
   data={userId:id,version:1,eligible:!prefs.completed&&!prefs.dismissed&&!(prefs.snoozedUntil>Date.now()),...prefs};
  }
  if(name==='notification_preferences')data={...(config.admin?{registrations:true}:{}),invitations:false,asyncDefault:false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC'};
  if(name==='account_access_snapshot')data={userId:id,enabled:config.enabled!==false,status:config.enabled===false?'pending':'enabled',revision:1,email:'player@example.invalid',emailDelivery:'accepted',verified:config.verified!==false,admin:!!config.admin};
  if(name==='platform_notification_center')data={items:[],actionable:0};
  if(name==='admin_account_balances')data=[];
  if(name==='account_statement')data={balance:'0.00',transactions:[],has_more:false,next_cursor:null};
  return {data,error:null};
 },
 channel:()=>{const channel:any={on:()=>channel,subscribe:()=>channel,unsubscribe:()=>{}};return channel;},removeChannel:()=>{},
};
(window as any).fixtureLogin=()=>{signedIn=true;for(const fn of listeners)fn('SIGNED_IN',session());};
