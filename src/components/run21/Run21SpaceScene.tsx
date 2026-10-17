import {memo,useId} from 'react';
import './run21Space.css';

// Original vector scene. Fixed coordinates are artwork, never gameplay geometry.
const stars=Array.from({length:175},(_,i)=>({x:(i*137+23)%1000,y:(i*83+41)%1000,r:i%17===0?2: i%4===0?1.2:.7,opacity:.28+(i%5)*.13}));
export const Run21SpaceScene=memo(function Run21SpaceScene(){
 const id=useId();
 return <div className="run21-space-scene" aria-hidden="true">
  <svg className="run21-stars" viewBox="0 0 1000 1000" preserveAspectRatio="none">{stars.map((s,i)=><circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.opacity} fill="#c4dafa"/>)}</svg>
  <svg className="run21-ringed-planet" viewBox="0 0 240 200">
   <defs><radialGradient id={id+'-blue'} cx="32%" cy="28%"><stop stopColor="#839bc8"/><stop offset=".55" stopColor="#344f80"/><stop offset="1" stopColor="#111d38"/></radialGradient></defs>
   <ellipse cx="120" cy="100" rx="114" ry="30" transform="rotate(-26 120 100)" fill="none" stroke="#9a9fca" strokeWidth="7" opacity=".55"/>
   <circle cx="120" cy="100" r="65" fill={`url(#${id}-blue)`}/>
   <path d="M70 63q45-23 99 18M61 90q52-20 122 22" fill="none" stroke="#adbce0" strokeWidth="8" opacity=".15"/>
  </svg>
  <svg className="run21-distant-planet" viewBox="0 0 200 200"><defs><radialGradient id={id+'-warm'} cx="30%" cy="20%"><stop stopColor="#ae8cba"/><stop offset=".6" stopColor="#635078"/><stop offset="1" stopColor="#18213c"/></radialGradient></defs><circle cx="100" cy="100" r="96" fill={`url(#${id}-warm)`}/><path d="M16 54q85-28 168 33M5 88q85-28 188 33" fill="none" stroke="#d3a3bc" strokeWidth="7" opacity=".14"/></svg>
 </div>;
});
