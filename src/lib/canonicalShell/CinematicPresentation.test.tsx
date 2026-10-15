// @vitest-environment jsdom
import {act, useEffect} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {CinematicPresentationContext, useCinematicPresentation, usePresentationSurfaceReady} from './CinematicPresentation';
import type {PresentationMode} from './presentationMode';

let host:HTMLDivElement,root:Root;
const mounted=vi.fn(),unmounted=vi.fn();
function Surface({mode,ready,label}:{mode:PresentationMode;ready:boolean;label:string}){
  usePresentationSurfaceReady(mode,ready);
  useEffect(()=>{mounted();return unmounted;},[]);
  return <button>{label}</button>;
}
function Shell(props:{presentationMode:PresentationMode;ready:boolean;label:string;blocked?:boolean}){
  const c=useCinematicPresentation(props,props.blocked??false);
  return <CinematicPresentationContext.Provider value={c.context}><div data-phase={c.phase} data-mode={c.frame.presentationMode}>
    <div ref={c.columnRef} tabIndex={-1}><Surface mode={c.frame.presentationMode} ready={c.frame.ready} label={c.frame.label}/></div>
  </div></CinematicPresentationContext.Provider>;
}
const render=(mode:PresentationMode,ready=true,label:string=mode,blocked=false)=>act(()=>root.render(<Shell presentationMode={mode} ready={ready} label={label} blocked={blocked}/>));
const tick=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
beforeEach(()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});mounted.mockClear();unmounted.mockClear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it('uses one 450ms dissolve, keeps the owner mounted, and does not replay on round updates',()=>{
  render('table');const owner=host.querySelector('button');render('fullscreen');
  expect(host.firstElementChild?.getAttribute('data-phase')).toBe('outgoing');expect(host.textContent).toBe('table');
  expect(owner?.parentElement?.inert).toBe(true);
  tick(170);expect(host.textContent).toBe('fullscreen');tick(80);expect(host.firstElementChild?.getAttribute('data-phase')).toBe('incoming');
  tick(200);expect(host.firstElementChild?.getAttribute('data-phase')).toBe('stable');
  render('fullscreen',true,'round 2');expect(host.firstElementChild?.getAttribute('data-phase')).toBe('stable');
  expect(host.querySelector('button')).toBe(owner);expect(mounted).toHaveBeenCalledTimes(1);expect(unmounted).not.toHaveBeenCalled();
});
it('waits for real readiness and terminal completion, then returns through table',()=>{
  render('table');render('fullscreen',false);tick(170);tick(5000);
  expect(host.firstElementChild?.getAttribute('data-phase')).toBe('bridge');
  render('fullscreen',true);tick(0);tick(200);
  render('table',true,'setup',true);tick(1000);expect(host.textContent).toBe('fullscreen');
  render('table',true,'setup');tick(170);tick(80);tick(200);expect(host.textContent).toBe('setup');
  render('fullscreen',true,'second game');tick(170);tick(80);tick(200);expect(host.textContent).toBe('second game');
});
it('skips motion for reduced motion while retaining readiness and cold-mount behavior',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
  render('fullscreen');expect(host.firstElementChild?.getAttribute('data-phase')).toBe('stable');
  render('table',false);tick(0);expect(host.firstElementChild?.getAttribute('data-phase')).toBe('bridge');
  render('table',true);tick(0);expect(host.firstElementChild?.getAttribute('data-phase')).toBe('stable');
});
