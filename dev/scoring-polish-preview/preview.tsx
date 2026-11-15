import {useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {SoloDrop357} from '@/components/arcade/SoloDrop357';
import type {DropSnapshot,DropCommand} from '@/lib/drop357/model';
import {CribbagePlayCardAnimation} from '@/components/CribbagePlayCardAnimation';
import {CribbagePlayingCard} from '@/components/CribbagePlayingCard';
import {CribbagePegBoard} from '@/components/CribbagePegBoard';
import {useCribbagePeggingPresentation} from '@/hooks/useCribbagePeggingPresentation';
import {CanonicalAnnouncementProvider,useAnnouncements,useAnnouncementContext} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import {CanonicalAnnouncementLayer} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementLayer';
import {publishCribbageScoringNotice} from '@/lib/cribbage/scoringPresentation';
import type {CribbageCard,CribbageState} from '@/lib/cribbageTypes';
import {platformAudio,LAB_USER} from '../sound-lab/labAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import '@/index.css';
platformAudio.install();platformAudio.setUser(LAB_USER);
const evidence=(window as any).peggingEvidence={landedAt:null,cues:[],countingAt:null};
const present=platformAudio.present.bind(platformAudio);
platformAudio.present=(event,...args)=>{if(event.id.startsWith('cribbage-score:'))evidence.cues.push({id:event.id,at:performance.now(),duration:event.cue?.durationMs,
 title:document.querySelector('[data-canonical-announcement-content]')?.textContent});return present(event,...args);};
const players=[{id:'p1',user_id:LAB_USER,position:0,profiles:{username:'You'}},{id:'p2',user_id:'u2',position:1,profiles:{username:'Opponent'}}];
function Pegging({id,label,points,mode}:{id:number;label:string;points:number;mode:'self'|'opponent'}){
 const card:CribbageCard=useMemo(()=>({rank:label==='31'?'A':'7',suit:'clubs',value:label==='31'?1:7}),[label]);
 const base=useMemo(()=>({phase:'pegging',pegging:{playedCards:[]},playerStates:{p1:{pegScore:10},p2:{pegScore:20}}}) as unknown as CribbageState,[]);
 const [accepted,setAccepted]=useState(false),[landed,setLanded]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setAccepted(true),80);return()=>clearTimeout(timer);},[]);
 const state=useMemo(()=>accepted?{...base,phase:label==='Last'?'counting':'pegging',pegging:{playedCards:[{playerId:'p1',card}]},playerStates:{p1:{pegScore:10+points},p2:{pegScore:20}},
  lastEvent:{id:'award-'+id,type:label==='Go'?'go_point':'pegging_points',playerId:'p1',points,label,createdAt:''}} as CribbageState:base,[accepted,base,card,id,label,points]);
 const scope='preview-'+id,sequence=useCribbagePeggingPresentation({scope,state,admitted:true,active:true}),rail=useAnnouncements();
 useLayoutEffect(()=>{const event=sequence.event;if(event)publishCribbageScoringNotice(rail,{gameId:'preview',roundId:scope,id:event.id,title:'You: '+label+' (+'+points+')',ttlMs:3000,onRetired:()=>sequence.retired(event.id)});},[sequence.event?.id]);
 const noticeVisible=useAnnouncementContext()?.active?.id===sequence.event?.id&&!!sequence.event;
 useEffect(()=>{if(noticeVisible&&sequence.event)sequence.presented(sequence.event.id);},[noticeVisible,sequence.event?.id]);
 useEffect(()=>{if(accepted&&label==='Last'&&!sequence.pending&&landed){evidence.countingAt=performance.now();}},[sequence.pending,landed,accepted,label]);
 const intent=useMemo(()=>({id:scope,mode,card,sourceRect:{x:mode==='self'?100:220,y:mode==='self'?530:180,width:45,height:65},destRect:{x:160,y:330,width:45,height:65}}),[scope,mode,card]);
 return <div style={{position:'relative',height:540,background:'radial-gradient(ellipse,#235940,#102d23)',borderRadius:20,color:'white',overflow:'hidden'}}>
  <CanonicalAnnouncementLayer/><div style={{position:'absolute',top:170,left:'42%'}}>{landed&&<CribbagePlayingCard card={card} widthPx={55}/>}</div>
  <div style={{position:'absolute',top:380,left:15,right:15}}><CribbagePegBoard players={players} playerStates={state.playerStates} winningScore={121}
   audioActive audioAward={noticeVisible&&sequence.event?{id:scope+':'+sequence.event.id,points:sequence.event.points}:null}/></div>
  <CribbagePlayCardAnimation intent={intent} onSettled={()=>{evidence.landedAt=performance.now();setLanded(true);sequence.landed(scope,card);}}/>
  <p data-handoff={accepted&&landed&&!sequence.pending?'ready':'held'} style={{position:'absolute',bottom:20,left:20}}>{label==='Last'&&accepted&&landed&&!sequence.pending?'Ready for hand scoring':landed?'Card landed':'Card travelling'}</p>
 </div>;
}
function DropPreview(){
 const transport=useMemo(()=>{let state:DropSnapshot={id:'suit-preview',revision:1,status:'active',ruleset:'357-drop/6',serverAt:Date.now(),roundId:'preview-round',round:1,rounds:3,banked:0,score:0,phase:'playing',
  carryChoices:[[0],[0,1]],lanes:[[0,13,26],[39,3,16,null,null],[29,42,8,21,34,null,null]],laneResults:[null,null,null],current:49,stockLeft:34,passesLeft:2,placements:12,startedAt:Date.now(),deadline:Date.now()+3600000,result:null,completion:null};
  return {load:async()=>({...state,serverAt:Date.now()}),subscribe:(_:()=>void,ready:(yes:boolean)=>void)=>{queueMicrotask(()=>ready(true));return()=>{};},
   send:async(command:DropCommand)=>{const lanes=state.lanes.map(row=>[...row]);if(command.intent.type==='place'){const [lane,slot]=command.intent.items;lanes[lane][slot]=state.current;}
    state={...state,lanes,current:(state.current!+13)%52,revision:state.revision+1,acceptedRequestId:command.requestId,placements:state.placements+(command.intent.type==='place'?1:0),serverAt:Date.now()};return state;}};
 },[]);
 return <SoloDrop357 runId="suit-preview" userId={LAB_USER} transport={transport}/>;
}
function App(){const [tab,setTab]=useState('drop'),[before,setBefore]=useState(false),[ready,setReady]=useState(false),[scenario,setScenario]=useState({id:0,label:'Pair',points:2,mode:'self' as 'self'|'opponent'});
 useEffect(()=>{void preloadApprovedSounds().then(()=>setReady(true));return platformAudio.acquireGameplay();},[]);
 function run(label:string,points:number,mode:'self'|'opponent'='self'){evidence.landedAt=null;evidence.cues=[];evidence.countingAt=null;platformAudio.setPreference(LAB_USER,true);platformAudio.unlock(true);setScenario(s=>({id:s.id+1,label,points,mode}));}
 return <div className={before?'preview-before':''} data-ready={ready} style={{height:'100%',background:'#101720',color:'white',display:'flex',flexDirection:'column'}}>
  <style>{`html,body,#root{height:100%;margin:0}.preview-before .drop357-page [data-arcade-classic-suit] path{transform:none}.preview-controls{display:flex;gap:6px;padding:8px;flex-wrap:wrap;background:#101720;flex:none}.preview-controls button{border:1px solid #b6a17b;padding:5px 9px;border-radius:6px;font-size:13px}.preview-controls button[aria-pressed=true]{background:#dac090;color:#101720}`}</style>
  <nav className="preview-controls"><button aria-pressed={tab==='drop'} onClick={()=>setTab('drop')}>357 Drop</button><button aria-pressed={tab==='crib'} onClick={()=>setTab('crib')}>Cribbage</button>
   {tab==='drop'&&<button aria-pressed={!before} onClick={()=>setBefore(v=>!v)}>{before?'Show larger suits':'Show original suits'}</button>}</nav>
  {tab==='drop'?<div style={{position:'relative',flex:1,minHeight:0}}><DropPreview/></div>:<>
   <div className="preview-controls"><button disabled={!ready} onClick={()=>run('Pair',2)}>Pair +2</button><button disabled={!ready} onClick={()=>run('Pair',2,'opponent')}>Opponent +2</button><button disabled={!ready} onClick={()=>run('Last',1)}>Last +1</button><button disabled={!ready} onClick={()=>run('Go',1)}>Go +1</button><button disabled={!ready} onClick={()=>run('31',2)}>31 +2</button></div>
   <CanonicalAnnouncementProvider dealerGameId="preview">{scenario.id>0?<Pegging key={scenario.id} {...scenario}/>:<p style={{padding:24}}>Choose a scoring event to hear its timing.</p>}</CanonicalAnnouncementProvider></>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
