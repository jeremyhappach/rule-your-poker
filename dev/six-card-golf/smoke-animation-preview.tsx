// Local rendering fixture. No financial state or authority is mounted.
import {StrictMode,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LegsToPlayerAnimation} from '@/components/LegsToPlayerAnimation';
import {SweepTheLegsAnimation} from '@/components/SweepTheLegsAnimation';
import {GolfScorecard} from '@/components/golf/GolfScorecard';
import type {GolfSnapshot} from '@/lib/golf/model';
import '@/index.css';
import '@/components/golf/golf.css';
const snapshot={id:'local',scope:'hole2',phase:'hole_complete',players:[{id:'a',name:'You'},{id:'b',name:'Peer'}],holes:[{hole:1,scores:{a:25,b:10}},{hole:2,scores:{a:7,b:-2}}]} as unknown as GolfSnapshot;
function App(){
 const box=useRef<HTMLDivElement>(null),[run,setRun]=useState(false),[legs,setLegs]=useState(false),[overlay,setOverlay]=useState(false);
 const done=legs&&overlay;
 return <div ref={box} style={{position:'relative',height:600,width:'100%',background:'#14563b'}}>
  <button onClick={()=>setRun(true)}>Start rendering fixture</button>
  <div data-chip-center="1" style={{position:'absolute',top:'25%',left:'15%'}}>Peer</div><div data-chip-center="2" style={{position:'absolute',top:'70%',left:'70%'}}>Winner</div>
  {run&&<GolfScorecard snapshot={snapshot} writeHole={2}/>}
  {run&&!done&&<><LegsToPlayerAnimation triggerId="fixture:round2" legPositions={[{playerId:'peer',position:1,legCount:2}]} winnerPosition={2} currentPlayerPosition={2} getClockwiseDistance={()=>0} containerRef={box} legsToWin={3} onAnimationComplete={()=>setLegs(true)}/><SweepTheLegsAnimation show holdUntilDismissed onComplete={()=>setOverlay(true)}/></>}
  <output data-fixture-receipts data-legs={legs} data-overlay={overlay} data-done={done}>{done?'Both actual animations completed':''}</output>
 </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
