// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {ChessBoard} from './ChessBoard';
import {newChess,playChess} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
import {chessSound} from '@/lib/chess/sound';
vi.mock('@/lib/chess/sound',()=>({chessSound:vi.fn(()=>vi.fn())}));
let root:Root,host:HTMLDivElement,reduced=false;
const mediaListeners=new Set<()=>void>();
beforeEach(()=>{
 localStorage.clear();vi.clearAllMocks();reduced=false;mediaListeners.clear();
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.stubGlobal('matchMedia',()=>({get matches(){return reduced;},addEventListener:(_:string,f:()=>void)=>mediaListeners.add(f),removeEventListener:(_:string,f:()=>void)=>mediaListeners.delete(f)}));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
function initial(mode:'live'|'async') {
 const state=newChess({identity:{sessionId:'s',dealerGameId:'g',roundId:'r'},players:[{id:'white',userId:'w',name:'White',seat:1,isBot:false},{id:'black',userId:'b',name:'Black',seat:2,isBot:false}],backgroundId:'photo',mode},1000);
 return {...state,viewerId:'black',canAct:false,opened:true} as ChessSnapshot;
}
const render=(v:ChessSnapshot)=>act(()=>root.render(<ChessBoard view={v} pending={false} onIntent={async()=>true}/>));
// JSDOM exposes WebKit styles but no native AnimationEvent, so React uses this prefix.
const event=(selector:string,name:string)=>act(()=>host.querySelector(selector)!.dispatchEvent(new Event(name==='animationstart'?'webkitAnimationStart':'webkitAnimationEnd',{bubbles:true})));
function move(v:ChessSnapshot,from:string,to:string){return {...v,...playChess({...v,opened:true,deadline:100000},v.players[v.turnIndex].id,{type:'move',from,to} as Parameters<typeof playChess>[2],2000)};}
describe.each(['live','async'] as const)('%s opponent presentation',mode=>{
 it('starts sound on actual motion, finishes on animation end, and consumes remount/repeated snapshots',()=>{
  const v=initial(mode);render(v);const next=move(v,'e2','e4');render(next);
  expect(chessSound).not.toHaveBeenCalled();
  event('.chess-slide','animationstart');expect(chessSound).toHaveBeenCalledTimes(1);expect(vi.mocked(chessSound).mock.calls[0][1]).toBe('slide');
  render({...next});expect(chessSound).toHaveBeenCalledTimes(1);
  event('.chess-slide','animationend');expect(host.querySelector('.chess-motion')).toBeNull();
  act(()=>root.unmount());root=createRoot(host);render(next);expect(host.querySelector('.chess-motion')).toBeNull();expect(chessSound).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('moves first, then crumbles; knight=%s; child events cannot duplicate or finish it',knight=>{
  let v=initial(mode);v=move(v,knight?'g1':'e2',knight?'f3':'e4');v=move(v,knight?'e7':'d7',knight?'e5':'d5');render(v);event('.chess-slide','animationend');
  vi.clearAllMocks();render(move(v,knight?'f3':'e4',knight?'e5':'d5'));expect(host.querySelector('.chess-poof')).toBeNull();
  expect(host.querySelector('.chess-capture-target .chess-piece')).not.toBeNull();
  event('.chess-slide','animationstart');expect(vi.mocked(chessSound).mock.calls.map(c=>c[1])).toEqual([knight?'hop':'slide']);
  event('.chess-slide','animationend');expect(host.querySelectorAll('.chess-fragment')).toHaveLength(9);
  event('.chess-fragment','animationstart');expect(chessSound).toHaveBeenCalledTimes(1);
  event('.chess-poof','animationstart');expect(vi.mocked(chessSound).mock.calls.map(c=>c[1])).toEqual([knight?'hop':'slide','poof']);
  event('.chess-fragment','animationend');expect(host.querySelector('.chess-motion')).not.toBeNull();
  event('.chess-poof','animationend');expect(host.querySelector('.chess-motion')).toBeNull();
 });
 it('consumes reduced-motion moves silently and settles an in-flight animation when preference changes',()=>{
  let v=initial(mode);render(v);reduced=true;v=move(v,'e2','e4');render(v);expect(host.querySelector('.chess-motion')).toBeNull();expect(chessSound).not.toHaveBeenCalled();
  reduced=false;v=move(v,'g8','f6');render(v);event('.chess-hop','animationstart');expect(vi.mocked(chessSound).mock.calls[0][1]).toBe('hop');
  reduced=true;act(()=>mediaListeners.forEach(f=>f()));expect(host.querySelector('.chess-motion')).toBeNull();expect(vi.mocked(chessSound).mock.results[0].value).toHaveBeenCalled();
 });
});

it('releases an Async handoff on actual movement end, or instantly for reduced motion',()=>{
 const done=vi.fn(),v=move(initial('async'),'e2','e4');
 act(()=>root.render(<ChessBoard view={v} pending={false} onIntent={async()=>true} onMovePresentationComplete={done}/>));
 expect(done).not.toHaveBeenCalled();event('.chess-slide','animationend');expect(done).toHaveBeenCalledTimes(1);
 reduced=true;const next=move(v,'e7','e5');
 act(()=>root.render(<ChessBoard view={next} pending={false} onIntent={async()=>true} onMovePresentationComplete={done}/>));
 expect(done).toHaveBeenCalledTimes(2);expect(host.querySelector('.chess-motion')).toBeNull();
});

it('holds the Async submission through capture breakup after the mover arrives',()=>{
 let v=initial('async');v=move(v,'e2','e4');v=move(v,'d7','d5');v=move(v,'e4','d5');const done=vi.fn();
 act(()=>root.render(<ChessBoard view={v} pending={false} onIntent={async()=>true} onMovePresentationComplete={done}/>));
 event('.chess-slide','animationend');expect(done).not.toHaveBeenCalled();
 event('.chess-fragment','animationend');expect(done).not.toHaveBeenCalled();
 event('.chess-poof','animationend');expect(done).toHaveBeenCalledTimes(1);
});

function pointer(node:Element,type:string,x:number,y:number){act(()=>{const e=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});node.dispatchEvent(e);});}
function dragSetup(onIntent:(i:any)=>Promise<boolean>){const v={...initial('live'),viewerId:'white',canAct:true};act(()=>root.render(<ChessBoard view={v} pending={false} onIntent={onIntent}/>));const board=host.querySelector('.chess-board')!,source=host.querySelector('[data-square="e2"]')!;(source as any).setPointerCapture=vi.fn();board.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400,right:400,bottom:400,x:0,y:0,toJSON(){}});pointer(source,'pointerdown',225,325);pointer(board,'pointermove',225,225);return {v,board,source};}
it('keeps the home piece visible under the ghost, then solid while a legal drop awaits authority',()=>{
 const send=vi.fn(()=>new Promise<boolean>(()=>{})),{v,board,source}=dragSetup(send);expect(source.querySelector('.chess-piece')).not.toBeNull();expect(source.hasAttribute('data-dragging')).toBe(true);expect(host.querySelector('.chess-drag-ghost')).not.toBeNull();
 pointer(board,'pointerup',225,225);expect(send).toHaveBeenCalledWith({type:'move',from:'e2',to:'e4'});expect(host.querySelector('.chess-drag-ghost')).toBeNull();expect(source.hasAttribute('data-dragging')).toBe(false);expect(source.querySelector('.chess-piece')).not.toBeNull();expect(chessSound).not.toHaveBeenCalled();
 render(move(v,'e2','e4'));expect(host.querySelector('.chess-slide')).not.toBeNull();expect((host.querySelector('.chess-slide') as HTMLElement).style.top).toBe('75%');event('.chess-slide','animationstart');expect(vi.mocked(chessSound).mock.calls[0][1]).toBe('slide');
});
it('invalid drops remove only the ghost, retain the source and play one existing invalid cue',()=>{
 const send=vi.fn(async()=>true),{board,source}=dragSetup(send);pointer(board,'pointerup',225,175);expect(send).not.toHaveBeenCalled();expect(source.querySelector('.chess-piece')).not.toBeNull();expect(source.hasAttribute('data-dragging')).toBe(false);expect(host.querySelector('.chess-drag-ghost')).toBeNull();expect(host.querySelector('[data-square="e5"]')?.hasAttribute('data-rejected')).toBe(true);expect(vi.mocked(chessSound).mock.calls.map(c=>c[1])).toEqual(['invalid']);
});


describe('Async entry announcements',()=>{
 const advance=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
 const enter=(v:ChessSnapshot,send=vi.fn(async()=>true))=>act(()=>root.render(<ChessBoard view={{...v,canAct:true,opened:true}} announceOpponentMove pending={false} onIntent={send}/>));
 it('holds the old position for three seconds, fades before sound/motion, then holds Your Turn for two seconds',()=>{
  vi.useFakeTimers();const v=move(initial('async'),'e2','e4'),send=vi.fn(async()=>true);enter(v,send);
  expect(host.textContent).toContain("Opponent's Move...");expect(host.querySelector('[data-square="e2"] .chess-piece')).not.toBeNull();expect(host.querySelector('[data-square="e4"] .chess-piece')).toBeNull();expect(host.querySelector('.chess-motion')).toBeNull();expect(chessSound).not.toHaveBeenCalled();
  act(()=>(host.querySelector('[data-square="e7"]') as HTMLElement).click());act(()=>(host.querySelector('[data-square="e5"]') as HTMLElement).click());expect(send).not.toHaveBeenCalled();
  advance(2999);expect(host.querySelector('[data-stage="opponent"]')).not.toBeNull();enter({...v},send);advance(1);expect(host.querySelector('[data-stage="fading"]')).not.toBeNull();advance(199);expect(host.querySelector('.chess-motion')).toBeNull();advance(1);expect(host.querySelector('.chess-motion')).toBeNull();event('.chess-turn-message','animationend');expect(host.querySelector('.chess-turn-message')).toBeNull();
  event('.chess-slide','animationstart');expect(vi.mocked(chessSound).mock.calls.map(c=>c[1])).toEqual(['slide']);event('.chess-slide','animationend');expect(host.textContent).toContain('Your Turn');
  act(()=>(host.querySelector('[data-square="e7"]') as HTMLElement).click());act(()=>(host.querySelector('[data-square="e5"]') as HTMLElement).click());expect(send).not.toHaveBeenCalled();advance(1999);expect(host.textContent).toContain('Your Turn');advance(1);expect(host.querySelector('.chess-turn-message')).toBeNull();
  act(()=>(host.querySelector('[data-square="e7"]') as HTMLElement).click());act(()=>(host.querySelector('[data-square="e5"]') as HTMLElement).click());expect(send).toHaveBeenCalledTimes(1);
  act(()=>root.unmount());root=createRoot(host);enter(v);expect(host.querySelector('.chess-turn-message,.chess-motion')).toBeNull();
 });
 it('waits for capture breakup before Your Turn, without replaying on snapshot refresh',()=>{
  vi.useFakeTimers();let v=initial('async');v=move(v,'e2','e4');v=move(v,'d7','d5');v=move(v,'e4','d5');enter(v);advance(3000);advance(200);event('.chess-turn-message','animationend');event('.chess-slide','animationstart');event('.chess-slide','animationend');expect(host.textContent).not.toContain('Your Turn');event('.chess-poof','animationstart');expect(vi.mocked(chessSound).mock.calls.map(c=>c[1])).toEqual(['slide','poof']);event('.chess-poof','animationend');expect(host.textContent).toContain('Your Turn');enter({...v});advance(2000);expect(host.querySelector('.chess-turn-message,.chess-motion')).toBeNull();
 });
 it('keeps reduced-motion announcements static and silent',()=>{
  vi.useFakeTimers();reduced=true;const v=move(initial('async'),'e2','e4');enter(v);advance(3000);expect(host.textContent).toContain('Your Turn');expect(host.querySelector('.chess-motion')).toBeNull();expect(chessSound).not.toHaveBeenCalled();advance(2000);expect(host.querySelector('.chess-turn-message')).toBeNull();
 });
 it('cancels the announcement on hide and never starts a delayed animation after unmount',()=>{
  vi.useFakeTimers();const v=move(initial('async'),'e2','e4');enter(v);Object.defineProperty(document,'hidden',{configurable:true,value:true});act(()=>document.dispatchEvent(new Event('visibilitychange')));advance(6000);expect(host.querySelector('.chess-turn-message,.chess-motion')).toBeNull();expect(chessSound).not.toHaveBeenCalled();Object.defineProperty(document,'hidden',{configurable:true,value:false});
  enter({...v,identity:{...v.identity,dealerGameId:'new'}});act(()=>root.unmount());root=createRoot(host);advance(6000);expect(chessSound).not.toHaveBeenCalled();
 });
});
