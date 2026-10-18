import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
interface Activity {id:string;name:string;last_seen_at:string|null}
export function RecentLoginsDialog({open,onOpenChange}:{open:boolean;onOpenChange:(value:boolean)=>void}){
 const [rows,setRows]=useState<Activity[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{if(!open)return;let alive=true;setLoading(true);setRows([]);setError('');
  void Promise.resolve(supabase.rpc('admin_recent_activity' as never)).then(({data,error})=>{if(!alive)return;setLoading(false);if(error)setError(error.message);else setRows((data??[]) as unknown as Activity[]);}).catch(()=>{if(alive){setLoading(false);setError('Unable to load activity. Please reopen to retry.');}});return()=>{alive=false;};
 },[open]);
 const format=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'long'});
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Recent logins</DialogTitle><DialogDescription>Last seen in the app, not a login event. Times are shown in your local timezone.</DialogDescription></DialogHeader>
 {loading?<p role="status">Loading activity…</p>:error?<p role="alert">{error}</p>:<div className="max-h-96 overflow-auto"><table className="w-full text-left"><thead><tr><th>Player</th><th>Last seen</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td className="py-2 pr-3">{row.name}</td><td>{row.last_seen_at?<time dateTime={row.last_seen_at}>{format.format(new Date(row.last_seen_at))}</time>:'Never'}</td></tr>)}</tbody></table></div>}
 </DialogContent></Dialog>;
}
