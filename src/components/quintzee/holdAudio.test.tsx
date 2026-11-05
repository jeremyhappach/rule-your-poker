// @vitest-environment jsdom
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {QuintzeeView} from './QuintzeeView';
const sound=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/audio/quintzeeHoldCue',()=>({presentQuintzeeHold:sound}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children}:any)=><div data-fullscreen-board-slot><div data-canonical-felt-interaction-layer/>{children}</div>}));
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
afterEach(()=>{cleanup();sound.mockClear();});
const snapshot=(mode:string):any=>({id:'run',scope:'round',revision:1,theme:'modern',pausedAt:null,status:'active',outcome:'current',serverAt:1000,state:{rules:{},players:mode==='arcade'?['me']:['me','other'],scores:{me:0,other:0},round:1,turnIndex:0,qualified:[],results:[],finished:false,board:{rules:{version:'quintzee/3',durationMs:180000,clearBonus:35,upperThreshold:63,upperBonus:35},phase:'playing',deadline:31000,dice:[2,2,3,4,5],held:[],rollsRemaining:2,rollSerial:1,scores:{},potentials:{},scoreBefore:0,score:0,result:null}}});
it.each(['arcade','async','live'])('%s sounds each actual hold/release, never a reset, rerender or replay',mode=>{
 const s=snapshot(mode),props={snapshot:s,actor:'me',now:1000,pending:false,error:'',onIntent:vi.fn(),onReconnect:vi.fn()};const h=render(<QuintzeeView {...props}/>);
 const die=()=>h.getByRole('button',{name:/Die 1:/});expect(sound).not.toHaveBeenCalled();fireEvent.click(die());expect(die().getAttribute('aria-pressed')).toBe('true');fireEvent.click(die());expect(die().getAttribute('aria-pressed')).toBe('false');
 expect(sound.mock.calls.map(c=>c[2])).toEqual([true,false]);h.rerender(<QuintzeeView {...props} now={1100}/>);expect(sound).toHaveBeenCalledTimes(2);
 const next=structuredClone(s);next.scope='next';next.state.board.held=[0];h.rerender(<QuintzeeView {...props} snapshot={next}/>);expect(die().getAttribute('aria-pressed')).toBe('true');expect(sound).toHaveBeenCalledTimes(2);
 h.rerender(<QuintzeeView {...props} replay/>);fireEvent.click(die());expect(sound).toHaveBeenCalledTimes(2);
});
it('handles consecutive toggles in one batch without duplicating the held state',()=>{
 const h=render(<QuintzeeView snapshot={snapshot('arcade')} actor="me" now={1000} pending={false} error="" onIntent={()=>{}} onReconnect={()=>{}}/>),die=h.getByRole('button',{name:/Die 1:/});
 act(()=>{fireEvent.click(die);fireEvent.click(die);});expect(die.getAttribute('aria-pressed')).toBe('false');expect(sound.mock.calls.map(c=>c[2])).toEqual([true,false]);
});
