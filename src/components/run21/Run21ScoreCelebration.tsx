import {useEffect} from 'react';
import {createPortal} from 'react-dom';
import {SHELL_Z} from '@/lib/canonicalShell/zLayers';
import type {ScoreCelebrationReceipt} from '@/lib/run21/scoreCelebration';
import './scoreCelebration.css';

export function Run21ScoreCelebration({receipt,onRetire}:{receipt:ScoreCelebrationReceipt;onRetire:(key:string)=>void}){
  const perfect=receipt.aggregate===105;
  useEffect(()=>{
    const timer=setTimeout(()=>onRetire(receipt.key),perfect?3800:2800);
    return()=>clearTimeout(timer);
  },[receipt.key,perfect,onRetire]);
  return createPortal(<div className={`run21-celebration ${perfect?'run21-celebration-gold':'run21-celebration-silver'}`}
    style={{zIndex:SHELL_Z.MODAL_CONTENT}} data-run21-celebration={receipt.key} role="status" aria-live="assertive" aria-atomic="true">
    <div className="run21-celebration-halo" aria-hidden="true"/>
    <div className="run21-celebration-content">
      <svg className="run21-medal" viewBox="0 0 200 240" aria-hidden="true">
        <path d="M45 10H88L108 85 68 110Z M112 10H155L132 110 92 85Z" fill={perfect?'#b93340':'#354e94'}/>
        <circle cx="100" cy="143" r="79" fill="currentColor"/>
        <circle cx="100" cy="143" r="67" fill="none" stroke="#302411" strokeWidth="3" opacity=".5"/>
        <path d="m100 84 10 21 23 3-17 17 4 23-20-11-20 11 4-23-17-17 23-3Z" fill="#302411" opacity=".65"/>
        <text x="100" y="184" textAnchor="middle" fontSize="43" fontWeight="900" fill="#231e18">{receipt.aggregate}</text>
      </svg>
      <p className="run21-celebration-eyebrow">{perfect?'THE PERFECT RUN':'SO CLOSE TO PERFECTION'}</p>
      <h2>{perfect?'PERFECT 105!':'INCREDIBLE 104!'}</h2>
      <p className="run21-celebration-player">{receipt.playerName}</p>
      <p>{perfect?'Five columns. Five 21s.':'Four 21s. One unforgettable run.'}</p>
    </div>
  </div>,document.body);
}
