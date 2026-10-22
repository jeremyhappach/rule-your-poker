import {useId} from 'react';

/** Original vector artwork, based on the supplied flag's silhouette/colors. */
export function GolfHoleFlag({hole}:{hole:number}){
 const id=useId().replace(/:/g,'');
 return <svg className="golf-hole-flag" viewBox="0 0 104 140" role="img" aria-label={'Hole '+hole}>
  <defs><linearGradient id={id+'pole'}><stop stopColor="#a4abb1"/><stop offset=".5" stopColor="#f4f6f7"/><stop offset="1" stopColor="#899298"/></linearGradient><linearGradient id={id+'flag'} x2="1" y2=".4"><stop stopColor="#be241c"/><stop offset=".4" stopColor="#ed493c"/><stop offset="1" stopColor="#c92923"/></linearGradient></defs>
  <ellipse cx="51" cy="123" rx="44" ry="13" fill="#528d2d"/><ellipse cx="51" cy="120" rx="43" ry="12" fill="#6aa637"/>
  <path d="M15 120l2-5m6 13l2-6m9-7l2-5m35 13l2-6m13 6l1-6m-34 13l2-4" stroke="#9bc35a" strokeWidth="1.5" opacity=".7"/>
  <ellipse cx="47" cy="122" rx="11" ry="3.5" fill="#d3d9bb"/><ellipse cx="48" cy="123" rx="8" ry="2.5" fill="#25341c"/>
  <rect x="36.5" y="4.5" width="5" height="121" rx="2.5" fill={'url(#'+id+'pole)'}/>
  <path d="M40 10Q65 8 96 13L80 32 95 51Q68 48 40 53Z" fill={'url(#'+id+'flag)'} stroke="#b92b23" strokeWidth=".6"/>
  <path d="M43 12v38" stroke="#ff8470" opacity=".5"/>
  <text x="65" y="39" textAnchor="middle" fill="#fff6e6" fontFamily="Arial,sans-serif" fontSize="27" fontWeight="800">{hole}</text>
 </svg>;
}
