import {useEffect,useRef,useState} from 'react';
import {useIsAdmin} from '@/hooks/useIsAdmin';
import {supabase} from '@/integrations/supabase/client';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';

type Mode='live'|'async';
type Game='chess'|'ptown-words';
type Info={available:boolean;reason:string|null;revision:number;kind:'move'|'timeout';sessionId:string};
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await (supabase.rpc as any)(name,args);if(error)throw Error(error.message);return data;
}
/** The role check only controls visibility. Both RPCs enforce admin authority. */
export function AdminBoardUndo({userId,mode,game,id}:{userId?:string;mode:Mode;game:Game;id:string}){
 const {isAdmin,loading}=useIsAdmin(userId),[open,setOpen]=useState(false),[info,setInfo]=useState<Info|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[retry,setRetry]=useState(0);
 const request=useRef<string|null>(null),busy=useRef(false);
 useEffect(()=>{if(!open||!isAdmin)return;let alive=true;setInfo(null);setError('');request.current=null;
  void rpc<Info>('admin_board_undo_info',{p_mode:mode,p_game:game,p_id:id}).then(v=>{if(alive)setInfo(v);}).catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;};
 },[open,isAdmin,mode,game,id,retry]);
 if(loading||!isAdmin)return null;
 const undo=async()=>{if(!info?.available||busy.current)return;busy.current=true;setPending(true);setError('');request.current??=crypto.randomUUID();
  try{const result=await rpc<{sessionId:string}>('admin_board_undo',{p_request:request.current,p_mode:mode,p_game:game,p_id:id,p_revision:info.revision});
   window.location.assign(mode==='async'?'/delayed/'+result.sessionId:'/game/'+result.sessionId);
  }catch(e){setError(e instanceof Error?e.message:'Undo failed. Retry the same request.');}finally{busy.current=false;setPending(false);}
 };
 return <><button type="button" className="text-xs underline" onClick={()=>setOpen(true)}>Admin undo</button>
  <Dialog open={open} onOpenChange={value=>{if(!pending)setOpen(value);}}><DialogContent><DialogTitle>Undo last opponent move</DialogTitle>
   <DialogDescription>Restore the saved board, scores, turn and clocks. Any settlement caused by this move or timeout will be reversed and recorded.</DialogDescription>
   {!info&&!error&&<p role="status">Checking saved state…</p>}
   {info&&!info.available&&<p role="status">{info.reason}</p>}
   {error&&<p role="alert">{error}</p>}
   {info?.available&&<button disabled={pending} onClick={()=>void undo()}>{pending?'Restoring…':request.current?'Retry undo':info.kind==='timeout'?'Undo timeout':'Undo move'}</button>}
   {error&&!info&&<button onClick={()=>setRetry(n=>n+1)}>Retry</button>}
   <button disabled={pending} onClick={()=>setOpen(false)}>Cancel</button>
  </DialogContent></Dialog></>;
}

/** Ended Live sessions retain an admin entry in their existing results surface. */
export function AdminSessionBoardUndo({sessionId,userId}:{sessionId:string;userId?:string}){
 const {isAdmin,loading}=useIsAdmin(userId),[rows,setRows]=useState<{id:string;game:Game}[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(!isAdmin)return;let alive=true;
  void rpc<{id:string;game:Game}[]>('admin_board_undo_matches',{p_session:sessionId}).then(v=>{if(alive)setRows(v);}).catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;};
 },[isAdmin,sessionId]);
 if(loading||!isAdmin)return null;
 return <div>{error&&<p role="alert">{error}</p>}{rows.map(r=><div key={r.id}><span>{r.game==='chess'?'Chess':'Words'} · </span><AdminBoardUndo userId={userId} mode="live" game={r.game} id={r.id}/></div>)}</div>;
}
