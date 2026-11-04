const adminId='11111111-1111-4111-8111-111111111111',targetId='22222222-2222-4222-8222-222222222222';
let signedIn=!new URLSearchParams(location.search).has('login');
const listeners=new Set<Function>();
const player={id:targetId,username:'Pending player',email:'pending@example.invalid',enabled:false,status:'pending',admin:false,verified:false,emailDelivery:'failed',createdAt:'2026-11-04T17:39:50Z',lastSeenAt:null,audit:[]};
const session=()=>signedIn?{access_token:'fixture-only',user:{id:adminId},expires_at:Date.now()/1000+3600}:null;
const notice={id:'notice',registration_user_id:targetId,match_id:null,kind:'registration',actionable:true,revision:1,read_revision:0,payload:{username:player.username,email:player.email}};
const balances=[{id:adminId,username:'Administrator',balance:'120.50',enabled:true,lastTransactionDate:null},{id:targetId,username:player.username,balance:'-37.25',enabled:false,lastTransactionDate:null}];
export const supabase={
 auth:{getSession:async()=>({data:{session:session()}}),onAuthStateChange:(fn:Function)=>{listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};},signOut:async()=>({error:null}),signInWithPassword:async()=>{window.smokeFixture.login();return {data:{session:session()},error:null};}},
 from:(table:string)=>{const value=table==='profiles'?{username:'Administrator',is_superuser:false}:table==='user_roles'?{role:'admin'}:null;
  const q:any=new Proxy({}, {get:(_target,key)=>key==='then'?(resolve:Function)=>Promise.resolve({data:table==='system_settings'?[]:value,error:null}).then(resolve as never):()=>q});return q;},
 rpc:async(name:string,args:any={})=>{
  let data:any=null;
  if(name==='notification_preferences')data={registrations:true,invitations:false,asyncDefault:false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC'};
  if(name==='account_access_snapshot')data={userId:adminId,enabled:true,status:'enabled',revision:1,email:'admin@example.invalid',verified:true,admin:true};
  if(name==='admin_account_directory')data=[player];
  if(name==='platform_notification_center')data={items:player.enabled?[]:[notice],actionable:player.enabled?0:1};
  if(name==='admin_set_account_access'){player.enabled=args.p_enabled;player.status=args.p_enabled?'enabled':'suspended';data={changed:true};}
  if(name==='admin_account_balances')data=balances;
  if(name==='account_statement')data={balance:args.p_profile_id===targetId?'-37.25':'120.50',transactions:[],has_more:false,next_cursor:null};
  return {data,error:null};
 },
 channel:()=>{const channel:any={on:()=>channel,subscribe:()=>channel,unsubscribe:()=>{}};return channel;},removeChannel:()=>{},
};
window.smokeFixture={login(){signedIn=true;for(const fn of listeners)fn('SIGNED_IN',session());for(const fn of listeners)fn('TOKEN_REFRESHED',session());},targetId};
