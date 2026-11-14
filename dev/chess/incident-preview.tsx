import {useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChessView} from '@/components/chess/ChessView';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {useChess} from '@/hooks/useChess';
import type {ChessTransport} from '@/lib/chess/client';
import '@/index.css';
const mode=new URLSearchParams(location.search).get('mode')==='async'?'async':'live';
function App(){
 const [tab,setTab]=useState<any>('cards');
 const transport=useMemo<ChessTransport>(()=>({load:async()=>{const r=await fetch('/fixture/chess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'state',mode})});return r.json();},send:async(c,signal)=>{const r=await fetch('/fixture/chess',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'action',mode,...c})});const v=await r.json();if(!r.ok)throw Error(v.error);return v;},subscribe:(_refresh,status)=>{queueMicrotask(()=>status(true));return()=>{};}}),[]);
 const game=useChess('00000000-0000-4000-8000-00000000c003','00000000-0000-4000-8000-00000000c001',transport,'incident-fixture');
 Object.assign(window,{fixtureGame:()=>game,openTurn:()=>game.act({type:'open'}),background:()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));},resume:()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));}});
 return <div style={{height:'100%',display:'flex'}}><ChessView {...game} view={game.snapshot} activeTab={tab} setActiveTab={setTab} panel={null} onIntent={game.act} onReconnect={game.reconnect} onPause={async()=>{await fetch('/fixture/pause',{method:'POST'});await game.reconnect();}}/></div>;
}
createRoot(document.getElementById('root')!).render(<ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider>);
