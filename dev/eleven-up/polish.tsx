// Synthetic presentation fixture only. No gameplay engine or database writes.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ElevenUpView} from '@/components/elevenUp/ElevenUpView';
import {ArcadeInfo} from '@/components/arcade/ArcadeInfo';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';
import type {ArcadeGame} from '@/lib/arcade/artwork';
import '@/index.css';
import '@/lib/arcade/arcade.css';
const params=new URLSearchParams(location.search),count=Number(params.get('players')??1),info=params.get('info') as ArcadeGame|null;
const view:ElevenSnapshot={id:'fixture',scope:'fixture:1',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo:count===1,players:Array.from({length:count},(_,i)=>({id:`player-${i}`,name:count===1?'You':`Player ${i+1}`,score:1800+i*1200,active:i===0,...(count>1?{chips:100}:{} )})),board:{rules:{version:'eleven-up/2',stageMs:180000,introMs:2500,readyMs:30000,holdMs:5000,clearCelebrationMs:3000},phase:'playing',slots:Array.from({length:22},(_,i)=>16+i),current:48,exposed:[8,17,21],passSlot:null,canPass:true,stockRemaining:28,groups:0,score:1800,deadline:181000,event:{label:'',points:0}}};
function Preview(){const [pending,setPending]=useState(false);return info?<main className="arcade-page"><ArcadeInfo game={info} name={info}/></main>:<div className="arcade-run" data-shell-presentation-mode="fullscreen"><ElevenUpView view={view} userId="player-0" now={1000} pending={pending} error="" epoch={0} onIntent={()=>setPending(true)} onReconnect={()=>{}}/></div>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
