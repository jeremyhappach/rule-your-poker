import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GameDefaultsConfig} from '@/components/GameDefaultsConfig';
import {ChessView} from '@/components/chess/ChessView';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import type {ChessSnapshot} from '@/lib/chess/client';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';
const params=new URLSearchParams(location.search);
const view:ChessSnapshot=params.has('board')?await(await fetch('/fixture/view')).json():null;
function App(){const[open,setOpen]=useState(true),[tab,setTab]=useState<ShellTabId>('cards');
 return view?<div style={{height:'100%',display:'flex'}}><ChessView view={view} now={view.serverAt} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} panel={null} onIntent={async()=>false} onReconnect={()=>{}}/></div>:<><button onClick={()=>setOpen(true)}>Open defaults</button><GameDefaultsConfig open={open} onOpenChange={setOpen}/></>;
}
createRoot(document.getElementById('root')!).render(<ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider>);
