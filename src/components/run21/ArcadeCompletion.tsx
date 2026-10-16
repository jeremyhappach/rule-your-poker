import {createPortal} from 'react-dom';
import {SHELL_Z} from '@/lib/canonicalShell/zLayers';
import type {CompletionRecord} from '@/lib/arcade/model';
import './arcadeCompletion.css';

export function ArcadeCompletion({score,record}:{score:number;record?:CompletionRecord|null}){
 const best=record?.kind==='broken';
 return createPortal(<div className={'arcade-completion'+(best?' arcade-completion-record':'')}
  style={{zIndex:SHELL_Z.MODAL_CONTENT}} data-arcade-completion role="status" aria-live="assertive" aria-atomic="true">
  <div className="arcade-completion-content">
   {best&&<><span className="arcade-record-star" aria-hidden="true">★</span><h2>NEW PERSONAL BEST!</h2></>}
   <p className="arcade-final-total">TOTAL SCORE: <strong>{score.toLocaleString()}</strong></p>
  </div>
 </div>,document.body);
}
