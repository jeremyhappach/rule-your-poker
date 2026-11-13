import {useCallback,useEffect,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {ChessBoard} from '@/components/chess/ChessBoard';
import {useChessLobbyReturn} from '@/hooks/useChessLobbyReturn';
import {newChess,playChess,type ChessIntent} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
import {platformAudio} from '@/lib/audio/platformAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import '@/index.css';
import './interaction.css';
// Isolated, nonfinancial fixture entry: excluded from production builds.
const user='00000000-0000-4000-8000-00000000c001';
const fixture=(capture:boolean):ChessSnapshot=>{const id=crypto.randomUUID(),state=newChess({identity:{sessionId:id,dealerGameId:id,roundId:id},mode:'live',backgroundId:'',players:[{id:user,userId:user,name:'White',seat:1,isBot:false},{id:'00000000-0000-4000-8000-00000000c002',userId:'00000000-0000-4000-8000-00000000c002',name:'Black',seat:2,isBot:false}]},Date.now(),capture?'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2':undefined);return {...state,id,revision:0,serverAt:Date.now(),viewerId:user,canAct:true,paused:false,pausedAt:null,finished:false,settled:false,settlement:null,financial:null};};

function PreviewBoard({initial,onReset}:{initial:ChessSnapshot;onReset:()=>void}){
 const [view,setView]=useState(initial),[pending,setPending]=useState(false),[submitted,setSubmitted]=useState(false),[lobby,setLobby]=useState(false);
 const leave=useCallback(()=>setLobby(true),[]),{holding,complete}=useChessLobbyReturn(leave);
 const move=async(intent:ChessIntent)=>{if(submitted)return false;setPending(true);try{const next=playChess(view,user,intent,Date.now());setView({...view,...next,revision:view.revision+1,canAct:false});setSubmitted(true);return true;}catch{return false;}finally{setPending(false);}};
 if(lobby)return <section className="chess-preview-lobby"><h2>Match lobby</h2><p>Preview complete.</p><button onClick={onReset}>Play again</button></section>;
 return <ChessBoard view={view} pending={pending} onIntent={move} onMovePresentationComplete={submitted?complete:undefined} returningToLobby={holding}/>;
}
function Demo(){
 const [capture,setCapture]=useState(false),[view,setView]=useState(()=>fixture(false));const sound=useSyncExternalStore(platformAudio.subscribe,platformAudio.getSnapshot);useEffect(()=>platformAudio.acquireGameplay(),[]);
 const reset=(next=capture)=>{setCapture(next);setView(fixture(next));};
 return <main className="chess-interaction-preview"><h1>Chess Async return preview</h1><nav aria-label="Preview controls"><button onClick={()=>reset(false)}>Moves</button><button onClick={()=>reset(true)}>Capture</button><button onClick={()=>reset()}>Reset</button><button onClick={()=>platformAudio.setPreference(user,!sound.enabled)}>{sound.enabled?'Mute':'Unmute'}</button></nav><p>{capture?'Drag the white pawn onto the black pawn.':'Drag a white pawn forward.'} After the animation, the board holds for five seconds before returning.</p><PreviewBoard key={view.id} initial={view} onReset={()=>reset()}/><p>Interactive preview only. No match or stake is created.</p></main>;
}
async function start(){await preloadApprovedSounds();platformAudio.install();platformAudio.setUser(user);platformAudio.setPreference(user,true);createRoot(document.getElementById('root')!).render(<Demo/>);}
void start();
