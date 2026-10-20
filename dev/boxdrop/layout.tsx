import {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {BoxdropView} from '@/components/boxdrop/BoxdropView';import type {BoxdropSnapshot,BoxdropBox} from '@/lib/boxdrop/model';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import '@/index.css';import '@/lib/arcade/arcade.css';
const q=new URLSearchParams(location.search),scene=q.get('scene')??'partial',multi=scene.startsWith('multi'),ready=['ready','bonus'].includes(scene),result=['round-end','clear','multi-round-end'].includes(scene);
const box=(value:number,id:number,recycled=false):BoxdropBox=>({value,id,recycled,color:['red','blue','green','yellow'][id%4] as BoxdropBox['color']});
const v:BoxdropSnapshot={id:'fixture',scope:'fixture:1',revision:1,serverAt:1000,round:scene==='bonus'?3:1,canAct:scene!=='multi-observer',paused:false,finished:false,settled:false,solo:!multi,players:Array.from({length:multi?2:1},(_,i)=>({id:'p'+i,name:'Player longname '+(i+1),score:999999,active:i===0,chips:100})),board:{
 rules:{version:'boxdrop/1',stageMs:100000,introMs:2500,holdMs:9000},phase:ready?'intro':result?'stage_complete':'playing',
 scales:Array.from({length:4},(_,i)=>({stage:scene==='raised'&&i===0?2:1,target:scene==='raised'&&i===0?21:32,limit:scene==='raised'&&i===0?3:6,sum:i===0?23:i===1?9:i===2?4:0,status:i===0&&scene==='closed'?'closed':i===0&&scene==='broken'?'broken':i===0&&scene==='short'?'short':'active',boxes:ready?[]:i===0?[box(7,1),box(3,2),box(10,3),box(3,4)]:i===1?[box(9,5)]:i===2?[box(4,6)]:[]})),
 current:box(2,9,scene==='queue-full'),queue:['queue','queue-full'].includes(scene)?Array.from({length:scene==='queue'?3:6},(_,i)=>box(i+1,i+20,true)):[],
 recycleIndicator:scene==='queue-full'?0:scene==='queue'?3000:6000,recycleStreak:0,completedFirstOrders:1,closures:0,highScore:120000,score:35000,deadline:ready?3500:result?10000:101000,event:{label:'Place a box',points:0},
 ...(result?{result:{id:'fixture:result',reason:scene==='clear'?'full_clear':'take_score',score:54700,scoreBefore:12000,displayScore:35000,stageScore:42700,firstOrderPoints:3200,closurePoints:15000,partialPoints:0,speedBonus:13700,recyclingBonus:6000,bonusEligible:true,completedFirstOrders:1,remainingMs:68500,completedAt:1000}}:{})
}};
if(ready)v.board.scales.forEach(s=>{s.sum=0;s.boxes=[];});
if(scene==='raised'){v.board.scales[0].sum=9;v.board.scales[0].boxes=[box(9,1)];}
if(scene==='closed')Object.assign(v.board.scales[0],{stage:2,target:21,limit:3,sum:21,boxes:[box(11,1),box(10,2)]});
if(scene==='short')Object.assign(v.board.scales[0],{sum:6,boxes:Array.from({length:6},(_,i)=>box(1,i))});
if(scene==='broken')Object.assign(v.board.scales[0],{sum:33,boxes:[box(11,1),box(11,2),box(11,3)]});
if(scene==='clear')v.board.scales.forEach((s,i)=>Object.assign(s,{stage:2,target:21,limit:3,status:'closed',sum:21,boxes:[box(11,i*2),box(10,i*2+1)]}));
function App(){
 const [entered,setEntered]=useState(!result),[tab,setTab]=useState<any>(scene==='rules'?'lobby':'cards');
 useEffect(()=>{if(result){const t=setTimeout(()=>setEntered(true),50);return()=>clearTimeout(t);}},[]);
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">{multi&&<header style={{height:'2.75rem',flexShrink:0}}>P-Town Poker</header>}<BoxdropView view={entered?v:{...v,board:{...v.board,phase:'playing',result:null}}} userId="p0" now={result?(scene==='clear'?2000:3500):1000} pending={false} error="" epoch={0} onIntent={()=>{}} onReconnect={()=>{}} onAbandon={()=>{}} activeTab={tab} setActiveTab={setTab} balance={p=><small>{p.chips} chips</small>}/></div>;
}
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider><ResponsiveGeometryProvider><App/></ResponsiveGeometryProvider></VisualPreferencesProvider>);
