// Loopback fixture transport; never imports production credentials.
export const supabase={
 rpc:async(name:string,args:unknown)=>{const r=await fetch('/__inspect/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});return r.json();},
 channel:()=>{let closed=false;const c={on:()=>c,subscribe:(status?:(s:string)=>void)=>{queueMicrotask(()=>{if(!closed)status?.('SUBSCRIBED');});return c;},close:()=>{closed=true;}};return c;},
 removeChannel:async(c:{close:()=>void})=>c.close(),
};
export const useAuthGuard=()=>({user:{id:'me'},isReady:true});
export const usePlayingPresence=()=>{};
export const playingTopic=()=>null;
export const roundGameplayRunning=()=>false;
export const NotificationBell=()=>null;
export const NotificationProvider=({children}:any)=>children;
