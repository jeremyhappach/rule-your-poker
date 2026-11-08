// Local presentation fixtures only: no gameplay service or production writes.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {ChuckyRoundTable} from '@/components/arcade/ChuckyRoundTable';
import type {V2Snapshot} from '@/lib/chuckyShowdown/model';
import type {useChuckyShowdown} from '@/hooks/useChuckyShowdown';
import '@/index.css';
import '@/components/arcade/chuckyShowdown.css';
import '@/components/originals/originals.css';

const base:V2Snapshot={
 id:'polish-fixture',revision:1,status:'active',ruleset:'chucky-showdown/3',serverAt:10000,completion:null,
 round:1,hand:2,roundId:'polish:1:2',phase:'fold_stay',since:10000,due:40000,
 player:[{rank:'2',suit:'♦'},{rank:'K',suit:'♥'},{rank:'6',suit:'♣'},{rank:'J',suit:'♥'}],
 community:[{rank:'K',suit:'♠'},{rank:'6',suit:'♥'}],chucky:[],
 folds:2,cracks:3,uses:[2,1,2,2,2,0,0],level:0,risk:1250,beforeRisk:1250,score:3000,reason:null,best:null,label:null,tie:null,
 config:{version:'chucky-showdown/3',foldMs:30000,selectMs:30000,maxFolds:3,maxCracks:3,winBonuses:[100,250,500,800,1250,2000,3000]},lastShowdown:null,lastRound:null,
};
type Fixture={v:V2Snapshot;now:number;epoch:number;competitive:boolean};
function App(){
 const [state,setState]=useState<Fixture>({v:base,now:12000,epoch:0,competitive:false});
 Object.assign(window,{
  setChuckyFixture:(patch:Partial<V2Snapshot>,elapsed=2000,competitive=false)=>setState(old=>({v:{...base,...patch},now:base.since+elapsed,epoch:old.epoch+1,competitive})),
  setChuckyTime:(elapsed:number)=>setState(old=>({...old,now:base.since+elapsed})),
  pushChuckyScene:(patch:Partial<V2Snapshot>,elapsed:number)=>setState(old=>({...old,v:{...old.v,...patch},now:base.since+elapsed})),
 });
 const {v,now,epoch,competitive}=state;
 const game={snapshot:v,now,ready:true,pending:false,recoveryEpoch:0,silent:false,error:'',livePhase:v.phase+':'+v.since,choice:null,bornEnded:false,
  act:(type:string,level?:number)=>{
   const board=[...base.community,{rank:'2' as const,suit:'♠' as const},{rank:'5' as const,suit:'♣' as const}];
   const patch=type==='stay'?{phase:'choose' as const,community:board}:type==='press'?{phase:'showdown' as const,community:board,level:level!}:{};
   setState(old=>({...old,v:{...v,...patch},now:12000,epoch:old.epoch+1}));
  },reconnect:()=>{}} as ReturnType<typeof useChuckyShowdown>;
 return <div className={competitive?'originals-competition':undefined}><ChuckyRoundTable key={epoch} v={v} game={game} userId="fixture" competitive={competitive}/></div>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
