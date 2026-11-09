// Offline response fixture, NOT a second game/rules engine. No network/database writes.
import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ElevenUpView} from '@/components/elevenUp/ElevenUpView';
import type {ElevenIntent,ElevenSnapshot} from '@/lib/elevenUp/model';
import {cueEvents,platformAudio} from './audio';
import '@/index.css';
import '@/lib/arcade/arcade.css';
const initial=():ElevenSnapshot=>({id:crypto.randomUUID(),scope:crypto.randomUUID(),revision:1,serverAt:1000,round:1,solo:true,canAct:true,paused:false,finished:false,settled:false,players:[{id:'local-review',name:'You',score:25200,active:true}],board:{rules:{version:'eleven-up/3',stageMs:180000,introMs:2500,readyMs:30000,holdMs:5000,clearCelebrationMs:3000},phase:'playing',slots:[36,null,null,null,null,null,null,null,null,48,null,null,null,null,null,null,null,null,40,41,24,16],current:44,exposed:[0,9,18,19,20,21],passSlot:1,canPass:true,stockRemaining:3,groups:4,score:25200,deadline:181000,event:{label:'',points:0}}});
function Review(){
 const [v,setView]=useState(initial),[now,setNow]=useState(1000),[pending,setPending]=useState(false),[done,setDone]=useState(false);
 const clock=useRef(performance.now()-1000),flight=useRef(false),timers=useRef<ReturnType<typeof setTimeout>[]>([]);
 useEffect(()=>{const id=setInterval(()=>setNow(performance.now()-clock.current),40);return()=>{clearInterval(id);timers.current.forEach(clearTimeout);};},[]);
 const later=(fn:()=>void,ms:number)=>timers.current.push(setTimeout(fn,ms));
 const send=(intent:ElevenIntent)=>{
  if(flight.current)return;flight.current=true;setPending(true);(window as any).review.submissions.push(intent);
  later(()=>{setView(old=>{
   const next=structuredClone(old);next.revision++;next.serverAt=performance.now()-clock.current;
   if(intent.type==='pass'){next.board.slots[1]=old.board.current;next.board.current=old.board.current===17?20:17;next.board.stockRemaining=2;next.board.exposed.push(1);next.board.canPass=false;}
   if(intent.type==='group'){next.board.slots=next.board.slots.map(id=>id!==null&&intent.items.includes(id)?null:id);if(intent.items.includes(next.board.current!))next.board.current=17;next.board.groups++;}
   if(intent.type==='take_score'){
    const completedAt=next.serverAt;next.board.phase='stage_complete';next.board.deadline=completedAt+5000;
    next.board.result={id:crypto.randomUUID(),reason:'take_score',score:31200,scoreBefore:25200,displayScore:25200,stageScore:31200,groupBonus:1000,clearBonus:0,stockBonus:0,timeBonus:5000,completedAt};next.players[0].score=31200;next.board.event={label:'Score taken',points:6000};
    later(()=>setView(current=>current.round===1?{...initial(),id:current.id,round:2,players:current.players}: {...current,revision:current.revision+1,finished:true,board:{...current.board,phase:'complete',result:null}}),5000);
   }
   return next;
  });flight.current=false;setPending(false);},120);
 };
 useEffect(()=>{(window as any).review={...(window as any).review,submissions:(window as any).review?.submissions??[],cueEvents,platformAudio,view:v,rerender:()=>setView(old=>({...old})),reset:()=>{timers.current.forEach(clearTimeout);flight.current=false;setPending(false);clock.current=performance.now()-1000;setView(initial());setDone(false);}};},[v]);
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">{done?<main><h1>Local leaderboard destination</h1><p>Review complete. Reload to repeat.</p></main>:<ElevenUpView view={v} userId="local-review" now={now} pending={pending} error="" epoch={0} onIntent={send} onReconnect={()=>{}} onFinish={()=>setDone(true)} onAbandon={()=>setDone(true)}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
