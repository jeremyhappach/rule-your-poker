import {useEffect,useState,type CSSProperties} from 'react';
import {Download,MoreVertical,Pause,Play,Share} from 'lucide-react';
import type {MobilePlatform} from '@/lib/mobileOnboarding';

const icon='/icons/ptown-poker-v2-192.png';

/** CSS frames teach one action at a time without video, timers or network work. */
export function MobileInstallAnimation({platform,active}:{platform:MobilePlatform;active:boolean}) {
 const iphone=platform==='iphone';
 const [paused,setPaused]=useState(false);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [visible,setVisible]=useState(()=>!document.hidden);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const motion=()=>setReduced(media.matches),visibility=()=>setVisible(!document.hidden);
  media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 const captions=iphone
  ?['Open Safari · holm357.com','P-Town Poker is open in Safari','Tap Share (or open the page menu)','The Share menu opens','Choose Add to Home Screen','Keep Open as Web App on · tap Add','Launch from your new app icon']
  :['Open Chrome · holm357.com','P-Town Poker is open in Chrome','Tap the three-dot menu','The Chrome menu opens','Choose Install app / Add to Home screen','Confirm Install or Add','Launch from your new app icon'];
 return <div className="onboarding-install-demo" data-playing={active&&visible&&!paused&&!reduced} data-reduced={reduced}>
  <div key={platform} className="onboarding-install-stage" role="img" aria-label={`${iphone?'iPhone Safari':'Android Chrome'} installation preview: open holm357.com, ${iphone?'Share, Add to Home Screen':'three-dot menu, Install app or Add to Home screen'}, confirm, then launch the P-Town Poker icon.`}>
   {captions.map((caption,step)=><div key={step} className="onboarding-install-frame" data-step={step} style={{'--frame':step} as CSSProperties} aria-hidden="true">
    <div className={`onboarding-demo-phone ${step===6?'onboarding-demo-home':''}`}>
     {step<6?<>
      <div className="onboarding-demo-address"><span>{iphone?'Safari':'Chrome'}</span><strong>holm357.com</strong>{!iphone&&<MoreVertical size={15} className={step===2?'onboarding-demo-highlight':''}/>}</div>
      <div className="onboarding-demo-app"><img src={icon} alt=""/><strong>P-Town Poker</strong><span>♠　♥　♣　♦</span></div>
      {iphone&&<div className="onboarding-demo-toolbar"><span>‹</span><Share size={18} className={step===2?'onboarding-demo-highlight':''}/><span>▢</span></div>}
      {(step===3||step===4)&&<div className="onboarding-demo-menu"><span>{iphone?'Share':'Chrome menu'}</span><div className={step===4?'onboarding-demo-highlight':''}><Download size={16}/>{iphone?'Add to Home Screen':'Install app'}</div>{!iphone&&<small>May say “Add to Home screen”</small>}</div>}
      {step===5&&<div className="onboarding-demo-confirm"><img src={icon} alt=""/><strong>P-Town Poker</strong>{iphone?<small>Open as Web App　✓</small>:<small>Install app / create shortcut</small>}<span className="onboarding-demo-highlight">{iphone?'Add':'Install'}</span></div>}
     </>:<><div className="onboarding-demo-home-icons"><i/><i/><i/><i/></div><img className="onboarding-demo-installed-icon" src={icon} alt=""/><strong>P-Town Poker</strong><span>Ready on your Home Screen</span></>}
    </div>
    <p>{step+1}. {caption}</p>
   </div>)}
  </div>
  <div className="onboarding-demo-controls"><span>{reduced?'Installation preview · follow the steps below':'Installation preview · 7-second loop'}</span>{!reduced&&<button type="button" onClick={()=>setPaused(value=>!value)} aria-label={paused?'Play installation animation':'Pause installation animation'}>{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'Play':'Pause'}</button>}</div>
 </div>;
}
