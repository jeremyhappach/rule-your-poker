import {forwardRef, type ButtonHTMLAttributes} from 'react';
import './arcadeAbandon.css';

/** Opens the game's existing confirmation; never advances or ends a run itself. */
export const ArcadeAbandonButton=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>>(
  function ArcadeAbandonButton({className='',...props},ref){
    return <button {...props} ref={ref} type="button" className={'arcade-abandon '+className}>Abandon</button>;
  });
