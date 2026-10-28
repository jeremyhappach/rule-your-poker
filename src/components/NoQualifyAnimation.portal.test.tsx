// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {NoQualifyAnimation} from './NoQualifyAnimation';
import {SHELL_Z} from '@/lib/canonicalShell/zLayers';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('does not strand the visual transfer barrier when its image never loads',()=>{
 vi.useFakeTimers();vi.stubGlobal('Image',class {complete=false;src='';});
 const complete=vi.fn();render(<NoQualifyAnimation show onComplete={complete}/>);
 act(()=>vi.advanceTimersByTime(1000));expect(document.querySelector('[data-no-qualify-overlay]')).not.toBeNull();
 expect(complete).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(2000));expect(complete).toHaveBeenCalledOnce();
});
it('escapes gameplay stacking and completes only after its visible two-second beat',()=>{
 vi.useFakeTimers();vi.stubGlobal('Image',class {complete=true;src='';});
 const complete=vi.fn(),host=document.createElement('div');host.style.transform='translateZ(0)';document.body.append(host);
 render(<NoQualifyAnimation show onComplete={complete}/>,{container:host});
 const overlay=document.querySelector<HTMLElement>('[data-no-qualify-overlay]');
 expect(overlay?.parentElement).toBe(document.body);expect(Number(overlay?.style.zIndex)).toBe(SHELL_Z.CELEBRATION);
 act(()=>vi.advanceTimersByTime(1999));expect(complete).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(1));expect(complete).toHaveBeenCalledOnce();expect(document.querySelector('[data-no-qualify-overlay]')).toBeNull();
 host.remove();
});
