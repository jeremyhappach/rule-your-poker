// Smoke-runner diagnostics only. Never records tokens, headers, or guess words.
export async function traceFiveAliveReview(page){
 const transport=[],responses=[],record=(list,value)=>{list.push({at:Date.now(),...value});if(list.length>200)list.shift();};
 page.on('websocket',socket=>socket.on('framereceived',frame=>{
  try{const value=JSON.parse(String(frame.payload));
   if(!/five-alive:|delayed-home:/.test(value.topic??''))return;
   if(!['phx_reply','phx_error','phx_close','system','postgres_changes'].includes(value.event))return;
   record(transport,{topic:value.topic,event:value.event,status:value.payload?.status,
    revision:value.payload?.data?.record?.revision,matchId:value.payload?.data?.record?.match_id});
  }catch{/* Non-JSON/binary frames are irrelevant to this Postgres channel. */}
 }));
 page.on('response',async response=>{
  try{const path=new URL(response.url()).pathname;
   if(!['/api/delayed','/fixture/request','/rest/v1/rpc/delayed_review_begin','/rest/v1/rpc/delayed_review_ack'].includes(path))return;
   const body=response.request().postDataJSON();if(path==='/api/delayed'&&body?.game!=='five-alive')return;
   const value=await response.json();record(responses,{path,op:body?.op,status:response.status(),revision:value.revision,
    reviewRevision:value.reviewRevision,round:value.view?.round,waiting:value.view?.current?.waiting,
    reviews:value.wordReviews?.map(({id,round,seen})=>({id,round,seen})),error:value.error});
  }catch{/* Navigation can close an outstanding response; keep prior evidence. */}
 });
 await page.addInitScript(()=>{
  window.fiveAliveReviewTrace=[];
  const capture=()=>{const value={hidden:document.hidden,online:navigator.onLine,
   review:document.querySelector('.five-alive-review-label')?.textContent??null,
   waiting:document.body?.textContent?.includes('Waiting for the other player.')??false,
   dialog:document.querySelector('[role=dialog]')?.getAttribute('data-state')??null,
   revealing:!!document.querySelector('[data-reveal]'),awarding:!!document.querySelector('.five-alive-award')};
   const prior=window.fiveAliveReviewTrace.at(-1)?.value;
   if(JSON.stringify(value)!==JSON.stringify(prior)){window.fiveAliveReviewTrace.push({at:performance.now(),value});if(window.fiveAliveReviewTrace.length>200)window.fiveAliveReviewTrace.shift();}
  };
  new MutationObserver(capture).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-state','data-reveal']});
  document.addEventListener('visibilitychange',capture);window.addEventListener('online',capture);window.addEventListener('offline',capture);
 });
 return async()=>({url:page.url(),transport:[...transport],responses:[...responses],presentation:await page.evaluate(()=>window.fiveAliveReviewTrace??[])});
}
