import { useEffect } from 'react';

/** A tab change removes the roller's animation surface. Reconcile that exact
 * presentation after the unmount commits; never wait forever for its callback. */
export function useAbsentDicePresenter(key:string|null, mounted:boolean, rolling:boolean, complete:(key:string|null)=>void) {
  useEffect(()=>{
    if(!key||mounted||rolling)return;
    const frame=requestAnimationFrame(()=>complete(key));
    return()=>cancelAnimationFrame(frame);
  },[key,mounted,rolling,complete]);
}
