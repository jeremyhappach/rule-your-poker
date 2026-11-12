import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PtownWordsView} from '@/components/ptownWords/PtownWordsView';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
import '@/index.css';
const mode=new URLSearchParams(location.search).get('mode')??'live';
const initial:WordsSnapshot=await (await fetch('/fixture/'+mode+'.json')).json();
function App(){
 const [photo,setPhoto]=useState<string>(),[tab,setTab]=useState<ShellTabId>('cards');
 Object.assign(window,{setPhoto});
 return <div style={{height:'100%',display:'flex'}}><PtownWordsView view={{...initial,backgroundId:photo}} now={initial.serverAt}
  asyncDraftUserId={mode==='async'?initial.viewerId:undefined} pending={false} connected error="" activeTab={tab} setActiveTab={setTab}
  panel={<span>Rules</span>} sessionEnded={false} onIntent={async()=>false} onReconnect={()=>{}}/></div>;
}
createRoot(document.getElementById('root')!).render(<ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider>);
