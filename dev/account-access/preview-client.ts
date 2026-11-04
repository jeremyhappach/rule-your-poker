const scenario=new URLSearchParams(location.search).get('scenario');
const access={userId:'player',enabled:!['pending','suspended'].includes(scenario??''),status:scenario==='pending'?'pending':scenario==='suspended'?'suspended':'enabled',revision:1,email:'long-player-address@example.invalid',verified:scenario==='verified',admin:false};
const players=[{id:'player',username:'newplayer87',email:'long-player-address@example.invalid',enabled:false,status:'pending',admin:false,verified:false,createdAt:'2026-11-04T12:00:00Z',lastSeenAt:null,audit:[]},{id:'admin',username:'Administrator',email:'admin@example.invalid',enabled:true,status:'enabled',admin:true,verified:true,createdAt:'2026-01-01T12:00:00Z',lastSeenAt:null,audit:[]}];
let realtime:Function|undefined;
async function rpc(name:string,args:any={}){
 if(name==='account_access_snapshot')return {...access};
 if(name==='admin_account_directory')return structuredClone(players);
 if(name==='admin_set_account_access'){const p=players.find(p=>p.id===args.p_user_id)!;p.enabled=args.p_enabled;p.status=args.p_enabled?'enabled':'suspended';p.audit.push({actorId:'admin',actor:'Administrator',at:new Date().toISOString(),from:'pending',to:p.status} as never);return {changed:true};}
 if(name==='notification_preferences')return {registrations:true,invitations:false,asyncDefault:false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC',...args.p_patch};
 return null;
}
export const supabase={rpc:async(name:string,args:any)=>({data:await rpc(name,args),error:null}),auth:{getSession:async()=>({data:{session:{access_token:'local-fixture',user:{id:'player'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},channel:()=>({on:(_event:any,_filter:any,callback:Function)=>{realtime=callback;return {subscribe:()=>({})};}}),removeChannel(){}};
window.accountFixture={rpc,suspend(){Object.assign(access,{enabled:false,status:'suspended',revision:2});realtime?.({new:{enabled:false,ever_enabled:true,revision:2}});}};
