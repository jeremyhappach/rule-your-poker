import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WinnerOverlay} from '@/components/YahtzeeOverlays';
import {DealerGamePicker} from '@/components/catalog/DealerGamePicker';
import {TriTowersView} from '@/components/triTowers/TriTowersView';
import {useTriTowers} from '@/hooks/useTriTowers';
import {controls} from './localClient';
import '@/index.css';
const viewer=new URLSearchParams(location.search).get('viewer')??'a';
controls.ack=new URLSearchParams(location.search).get('ack')!=='missing';
function Tri(){const h=useTriTowers('tri-local');const [tab,setTab]=useState<any>('cards');
 return <><output data-connected>{String(h.connected)}</output><output data-revision>{h.view?.revision}</output>{h.view&&<TriTowersView view={h.view} now={h.now} connected={h.connected} pending={h.pending} input={h.input} onIntent={h.act} activeTab={tab} setActiveTab={setTab} panel={<p>Local session</p>} error={h.error}/>}</>;}
function Route(){const [route,setRoute]=useState('yahtzee');const [done,setDone]=useState(false);
 useEffect(()=>{let live=true;const timer=setInterval(async()=>{const s=await fetch('/__incident__/state').then(r=>r.json());if(live)setRoute(s.route);},100);return()=>{live=false;clearInterval(timer);};},[]);
 if(route==='tri')return <Tri key="tri-local"/>;
 if(!done)return <WinnerOverlay winnerName="Hap" scores={[{name:'Hap',total:220},{name:'Lance',total:180}]} isWinnerMe={false} visible onDone={()=>setDone(true)}/>;
 return <section data-dealer-selection><DealerGamePicker roster={{players:2,humans:2}} access={{'tri-towers':true}} previousGame="yahtzee" onSelect={async game=>{if(game==='tri-towers')await fetch('/__incident__/control',{method:'POST',body:JSON.stringify({action:'select'})});}}/></section>;
}
createRoot(document.getElementById('root')!).render(<Route/>);
