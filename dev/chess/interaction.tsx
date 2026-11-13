import {useCallback,useEffect,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {Chess} from 'chess.js';
import {ChessBoard} from '@/components/chess/ChessBoard';
import {ChessPlayers} from '@/components/chess/ChessPlayers';
import {useChessLobbyReturn} from '@/hooks/useChessLobbyReturn';
import {newChess,playChess,type ChessIntent} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
import {platformAudio} from '@/lib/audio/platformAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import '@/index.css';
import './interaction.css';
// Isolated, nonfinancial fixture entry: excluded from production builds.
const user='00000000-0000-4000-8000-00000000c001';
const fixture=(capture:boolean,entry=false,trays=false):ChessSnapshot=>{const id=crypto.randomUUID(),state=newChess({identity:{sessionId:id,dealerGameId:id,roundId:id},mode:'live',backgroundId:'',players:[{id:user,userId:user,name:'You',seat:1,isBot:false},{id:'00000000-0000-4000-8000-00000000c002',userId:'00000000-0000-4000-8000-00000000c002',name:'Opponent',seat:2,isBot:false}]},Date.now(),capture&&!entry?'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2':undefined);let ready=state;if(entry||trays){const moves=trays?[['e2','e4'],['d7','d5'],['e4','d5'],['g8','f6'],['d2','d4'],['f6','d5']]:capture?[['e2','e4'],['d7','d5'],['g1','f3'],['d5','e4']]:[['e2','e4'],['e7','e5']];for(const [from,to] of moves)ready=playChess(ready,ready.players[ready.turnIndex].id,{type:'move',from,to} as ChessIntent,Date.now());}return {...ready,id,revision:0,serverAt:Date.now(),viewerId:user,canAct:true,paused:false,pausedAt:null,finished:false,settled:false,settlement:null,financial:null};};

function PreviewBoard({initial,onReset}:{initial:ChessSnapshot;onReset:()=>void}){
 const [view,setView]=useState(initial),[pending,setPending]=useState(false),[submitted,setSubmitted]=useState(false),[lobby,setLobby]=useState(false),[connected,setConnected]=useState(true),[black,setBlack]=useState(false);
 const leave=useCallback(()=>setLobby(true),[]),{holding,complete}=useChessLobbyReturn(leave);
 const move=async(intent:ChessIntent,expectedRevision?:number)=>{if(submitted||!connected||(expectedRevision!==undefined&&view.revision!==expectedRevision))return false;window.dispatchEvent(new CustomEvent('chess-preview-submit',{detail:{intent,revision:view.revision}}));setPending(true);try{const next=playChess(view,black?view.players[1].id:user,intent,Date.now());setView({...view,...next,revision:view.revision+1,canAct:false});setSubmitted(true);return true;}catch{return false;}finally{setPending(false);}};
 if(lobby)return <section className="chess-preview-lobby"><h2>Match lobby</h2><p>Preview complete.</p><button onClick={onReset}>Play again</button></section>;
 const shown={...view,viewerId:black?view.players[1].id:user,canAct:connected&&!submitted&&view.players[view.turnIndex].id===(black?view.players[1].id:user)};
 return <><ChessBoard key={shown.viewerId} announceOpponentMove view={shown} players={<ChessPlayers view={shown}/>} pending={pending} onIntent={move} onMovePresentationComplete={submitted?complete:undefined} returningToLobby={holding}/><details className="chess-preview-safety"><summary>Safety checks</summary><button onClick={()=>setConnected(!connected)}>{connected?'Disconnect':'Reconnect'}</button><button onClick={()=>setView(v=>({...v,revision:v.revision+1}))}>Refresh board revision</button><button onClick={()=>setView(v=>{const m=new Chess(v.fen).moves({verbose:true})[0];return {...v,...playChess(v,v.players[v.turnIndex].id,{type:'move',from:m.from,to:m.to},Date.now()),revision:v.revision+1};})}>Other device moves</button><button onClick={()=>setLobby(true)}>Leave board</button><button onClick={()=>setBlack(!black)}>{black?'View as White':'View as Black'}</button></details></>;
}
function Demo(){
 const [capture,setCapture]=useState(false),[entry,setEntry]=useState(false),[trays,setTrays]=useState(true),[view,setView]=useState(()=>fixture(false,false,true));const sound=useSyncExternalStore(platformAudio.subscribe,platformAudio.getSnapshot);useEffect(()=>platformAudio.acquireGameplay(),[]);
 const reset=(next=capture,enter=entry,showTrays=trays)=>{setCapture(next);setEntry(enter);setTrays(showTrays);setView(fixture(next,enter,showTrays));};
 return <main className="chess-interaction-preview"><h1>Chess trays + Undo preview</h1><nav aria-label="Preview controls"><button onClick={()=>reset(false,false,true)}>Trays + Undo</button><button onClick={()=>reset(false,false,false)}>Moves</button><button onClick={()=>reset(true,false,false)}>Capture</button><button onClick={()=>reset(false,true,false)}>Opponent move</button><button onClick={()=>reset(true,true,false)}>Opponent capture</button><button onClick={()=>reset()}>Reset</button><button onClick={()=>platformAudio.setPreference(user,!sound.enabled)}>{sound.enabled?'Mute':'Unmute'}</button></nav><p>Open either badge's tray. Move a piece, then tap Undo within three seconds or let the move finish.</p><PreviewBoard key={view.id} initial={view} onReset={()=>reset()}/><p>Interactive preview only. No match or stake is created.</p></main>;
}
async function start(){await preloadApprovedSounds();platformAudio.install();platformAudio.setUser(user);platformAudio.setPreference(user,true);createRoot(document.getElementById('root')!).render(<Demo/>);}
void start();
