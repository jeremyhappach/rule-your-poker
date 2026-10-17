import {useLayoutEffect,useState,type RefObject} from 'react';
/** Original vector artwork, inspired by the supplied shield-and-three-swords sequence. */
export function TriAllClear({elapsed,opacity,reduced,root}:{elapsed:number;opacity:number;reduced:boolean;root:RefObject<HTMLDivElement>}){
 const [slot,setSlot]=useState<{top:number;height:number}|null>(null);
 useLayoutEffect(()=>{
  const board=root.current,header=board?.querySelector('.tri-gameplay-top'),tableau=board?.querySelector('.tri-tableau');
  if(!board||!header||!tableau)return;
  const measure=()=>{
   const b=board.getBoundingClientRect(),h=header.getBoundingClientRect(),t=tableau.getBoundingClientRect();
   // Fit the actual gap below every participant's pill and above the tower badges.
   const gap=Math.max(0,t.top-h.bottom),height=Math.min(gap*.8,b.height*.24);
   setSlot(b.width/b.height<1.5?{top:h.bottom-b.top+(gap-height)/2,height}:null);
  };
  const observer=new ResizeObserver(measure);[board,header,tableau].forEach(el=>observer.observe(el));measure();return()=>observer.disconnect();
 },[root]);
 const enter=reduced?1:Math.min(1,Math.max(0,elapsed/700));
 return <div className="tri-all-clear" style={{opacity:reduced?1:opacity,...slot}} role="status" aria-label="All three towers cleared">
  <svg viewBox="0 0 240 240" aria-hidden="true">
   <defs><linearGradient id="tri-crest-gold" x2="1" y2="1"><stop stopColor="#fff5ae"/><stop offset=".5" stopColor="#f4b52f"/><stop offset="1" stopColor="#a85c13"/></linearGradient></defs>
   {[-42,0,42].map((angle,i)=><g key={angle} transform={`translate(120 ${105-(1-enter)*100}) rotate(${angle+(1-enter)*(i-1)*30})`} opacity={enter}>
    <path d="M-6-65H6L8 80 0 100-8 80Z" fill="#c7f1ff" stroke="#286595" strokeWidth="3"/><path d="M0-61V86" stroke="white" strokeWidth="2"/>
    <path d="M-27-46Q0-57 27-46L24-35Q0-45-24-35Z" fill="url(#tri-crest-gold)" stroke="#945813" strokeWidth="2"/>
    <path d="M-5-83H5V-49H-5Z" fill="#3055a2" stroke="#f4c85d" strokeWidth="3"/><circle cy="-86" r="7" fill="#f9d56c"/>
   </g>)}
   <g opacity={reduced?1:Math.max(0,Math.min(1,(elapsed-450)/300))}>
    <path d="M120 85Q151 106 178 95L174 151Q166 193 120 218Q74 193 66 151L62 95Q89 106 120 85Z" fill="url(#tri-crest-gold)" stroke="#854318" strokeWidth="3"/>
    <path d="M120 99Q148 117 164 110L160 151Q153 183 120 202Q87 183 80 151L76 110Q92 117 120 99Z" fill="#a92238" stroke="#ffd665" strokeWidth="3"/>
    <path d="M96 130V119H107V130H115V119H126V130H134V119H145V151H136V179H105V151H96Z" fill="#ffc64f"/>
   </g>
  </svg>
 </div>;
}
