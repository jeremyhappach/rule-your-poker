import {createRoot} from 'react-dom/client';
import {RoyalFlashView} from '@/components/royalFlash/RoyalFlashView';
import type {RoyalSnapshot} from '@/lib/royalFlash/model';
import '@/index.css';import '@/lib/arcade/arcade.css';
const count=Number(new URLSearchParams(location.search).get('players')??1);
const view:RoyalSnapshot={id:'fixture',scope:'fixture:1',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo:count===1,players:Array.from({length:count},(_,i)=>({id:`player-${i}`,name:count===1?'You':`Player ${i+1}`,score:18000+i*1200,active:i===0,...(count>1?{chips:100}:{})})),board:{rules:{version:'royal-flash/1',stageMs:150000,introMs:2500,readyMs:20000,holdMs:5000,clearCelebrationMs:0},phase:'playing',slots:Array.from({length:25},(_,i)=>i),current:25,stockRemaining:27,placements:25,handPoints:18000,lines:Array.from({length:10},()=>({kind:'pair',points:5000})),score:18000,deadline:151000,event:{label:'',points:0}}};
createRoot(document.getElementById('root')!).render(<div className="arcade-run" data-shell-presentation-mode="fullscreen"><RoyalFlashView view={view} userId="player-0" now={1000} pending={false} error="" epoch={0} onIntent={()=>{}} onReconnect={()=>{}}/></div>);
