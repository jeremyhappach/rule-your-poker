import {createPortal} from 'react-dom';
import type {ReactNode} from 'react';
import {SHELL_Z} from '@/lib/canonicalShell/zLayers';
import type {CompletionRecord} from '@/lib/arcade/model';
import './arcadeCompletion.css';

export function ArcadeCompletion({score,record,title='TOTAL SCORE:',children,onBackToArcade}:{score:number;record?:CompletionRecord|null;title?:string;children?:ReactNode;onBackToArcade?:()=>void}){
 const best=record?.kind==='broken';
 return createPortal(<div className={'arcade-completion'+(best?' arcade-completion-record':'')+(onBackToArcade?' arcade-completion-persistent':'')}
  style={{zIndex:SHELL_Z.MODAL_CONTENT}} data-arcade-completion role={onBackToArcade?'region':'status'} aria-label={onBackToArcade?title:undefined} aria-live={onBackToArcade?'polite':'assertive'} aria-atomic="true">
  <div className="arcade-completion-content">
   {best&&<><span className="arcade-record-star" aria-hidden="true">★</span><h2>NEW PERSONAL BEST!</h2></>}
   <p className="arcade-final-total">{title} <strong>{score.toLocaleString()}</strong></p>
   {children}
   {onBackToArcade&&<button className="arcade-results-back" onClick={onBackToArcade}>Back to Arcade</button>}
  </div>
 </div>,document.body);
}
