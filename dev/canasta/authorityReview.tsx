import {useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CanastaTable} from '@/components/canasta/CanastaTable';
import {CommandRejected,type Transport} from '@/lib/canasta/client';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {CanonicalTableHeader} from '@/lib/canonicalShell/CanonicalTableHeader';
import {GameChatContextProvider,type GameChatContextValue} from '@/hooks/GameChatContext';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {loadPresentationSnapshot} from './presentation';
import {GeometryLab} from '@/components/admin/GeometryLab';
import {GeometryLabDraftProvider} from '@/lib/geometryLab/GeometryLabDraftProvider';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import '@/index.css';
import './review.css';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const params=new URLSearchParams(location.search),scene=params.get('scene');
const viewer=scene||params.get('viewer')==='2'?2:1;
const players=[{id:id(3),user_id:id(5),position:1,chips:100,profiles:{username:'Player one'}},{id:id(4),user_id:id(6),position:5,chips:100,profiles:{username:'Player two'}}];
const chat={allMessages:[],sendMessage:async()=>{},isSending:false} as unknown as GameChatContextValue;
function App(){
 const [tab,setTab]=useState<ShellTabId>('cards');
 const [lab,setLab]=useState(false);
 const transport=useMemo<Transport>(()=>{
  async function request(op:string,body?:unknown){const r=await fetch(`/__canasta-fixture/${op}?viewer=${viewer}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new CommandRejected(data.error);return data;}
  return {load:()=>request('state'),send:c=>request('action',c),takeControl:()=>request('take-control',{}),subscribe:refresh=>{const source=new EventSource(`/__canasta-fixture/events?viewer=${viewer}`);source.onmessage=refresh;return()=>source.close();}};
 },[]);
 return <VisualPreferencesProvider userId={null}><ResponsiveGeometryProvider><GameChatContextProvider value={chat}>
  <PersistentTableShell gameType="canasta" anteAmount={10} projectionMode="active-canonical" viewerPosition={players[viewer-1].position} viewerUserId={players[viewer-1].user_id} seats={[{position:1,occupied:true},{position:5,occupied:true}]}
   header={<><CanonicalTableHeader title={scene?'Canasta · local '+scene+' fixture':'Canasta · local authority fixture'}/><button className="canasta-fixture-lab" onClick={()=>setLab(true)}>Geometry Lab</button></>}>
   <CanastaTable dealerGameId={id(1)} userId={players[viewer-1].user_id} players={players} activeTab={tab} setActiveTab={setTab} sessionEnded={false} onTerminalActive={()=>{}} onTerminalComplete={()=>{}} transport={transport}/>
  </PersistentTableShell>
  <Dialog open={lab} onOpenChange={setLab}><DialogContent className="canasta-dialog"><DialogTitle>Geometry Lab · local preview</DialogTitle><DialogDescription>Actual Geometry Lab controls. Draft preview only; close to discard. Database writes are blocked.</DialogDescription>{lab&&<GeometryLabDraftProvider><GeometryLab userId={players[viewer-1].user_id}/></GeometryLabDraftProvider>}</DialogContent></Dialog>
 </GameChatContextProvider></ResponsiveGeometryProvider></VisualPreferencesProvider>;
}
async function boot(){
 if(scene){const r=await fetch('/__canasta-fixture/reset?scene='+encodeURIComponent(scene),{method:'POST'});if(!r.ok)throw Error('Fixture initialization failed');}
 loadPresentationSnapshot();createRoot(document.getElementById('root')!).render(<App/>);
}
void boot();
