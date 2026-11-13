import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChessView} from '@/components/chess/ChessView';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {playChess,type ChessIntent} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';
import {platformAudio} from '@/lib/audio/platformAudio';
const original:ChessSnapshot=await (await fetch('/fixture/live.json')).json();
original.viewerId=original.players[0].id;original.canAct=true;
platformAudio.install();platformAudio.setUser(original.viewerId);
function App(){const [view,setView]=useState(original),[tab,setTab]=useState<ShellTabId>('cards'),[mount,setMount]=useState(0);
 const perform=(intent:ChessIntent,opponent=false)=>{try{const next=playChess(view,opponent?view.players[view.turnIndex].id:view.viewerId,intent,Date.now());setView({...view,...next,revision:view.revision+1,canAct:next.players[next.turnIndex].id===view.viewerId});return true;}catch{return false;}};
 Object.assign(window,{promotionFixture:()=>setView({...original,identity:{...original.identity,dealerGameId:crypto.randomUUID()},fen:'7k/P7/8/8/8/8/8/4K3 w - - 0 1',initialFen:'7k/P7/8/8/8/8/8/4K3 w - - 0 1',captured:{w:[{id:'lost-rook',type:'r'}],b:[{id:'their-queen',type:'q'}]},moves:[],positions:[],deadline:Date.now()+300000}),chessState:()=>view,opponentMove:(from:string,to:string)=>perform({type:'move',from,to} as ChessIntent,true),remount:()=>setMount(n=>n+1),photo:(id:string)=>setView(v=>({...v,backgroundId:id}))});
 return <div style={{height:'100%',display:'flex'}}><ChessView key={mount} view={view} now={Date.now()} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} panel={null} onIntent={async i=>perform(i)} onReconnect={()=>{}}/></div>;
}
createRoot(document.getElementById('root')!).render(<ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider>);
