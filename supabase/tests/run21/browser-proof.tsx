import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Run21FullscreenView} from '../../../src/components/run21/Run21FullscreenView';
import '../../../src/index.css';
import '../../../src/components/run21/run21.css';

function Proof(){
 const [snapshot,setSnapshot]=useState<any>(null),[pending,setPending]=useState(false),[tab,setTab]=useState<any>('cards');
 const token=new URLSearchParams(location.search).get('token'), endpoint=`/_run21-api?token=${token}`;
 useEffect(()=>{fetch(endpoint).then(r=>r.json()).then(setSnapshot);},[]);
 const intent=async(intent:any)=>{
  setPending(true);const view=snapshot.view;
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   identity:view.identity,roundId:view.roundId,playerId:view.viewerId,requestId:crypto.randomUUID(),revision:view.boards[view.viewerId].revision,intent,
  })});
  if(!response.ok)throw new Error(await response.text());
  setSnapshot(await response.json());setPending(false);
 };
 const revision=snapshot?.view.boards[snapshot.view.viewerId]?.revision??-1;
 return <div style={{height:'100%',display:'flex',flexDirection:'column'}} data-proof-revision={revision}><Run21FullscreenView snapshot={snapshot} now={snapshot?.serverAt??0}
  pending={pending} onIntent={intent} sessionEnded={false} activeTab={tab} setActiveTab={setTab} panel={null} error={null} replay={null} onReturnLive={()=>{}}/></div>;
}
createRoot(document.getElementById('root')!).render(<Proof/>);
