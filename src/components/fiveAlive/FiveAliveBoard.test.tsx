// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FiveAliveBoard,type FiveAliveBoardProps,type FiveAliveGuess} from './FiveAliveBoard';
import {endAnimation} from './animationTestEvent';

const {presentSound}=vi.hoisted(()=>({presentSound:vi.fn()}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound}));
afterEach(()=>{cleanup();presentSound.mockClear();});
const props=():FiveAliveBoardProps=>({mode:'arcade',round:1,score:0,
  current:{completed:false,guesses:[],nextBase:1000},pending:false,
  onSubmit:vi.fn(),onBack:vi.fn(),onRules:vi.fn(),onAbandon:vi.fn()});

it('accepts touch and physical keys and only submits a complete word',()=>{
  const p=props();render(<FiveAliveBoard {...p}/>);
  fireEvent.click(screen.getByRole('button',{name:'Enter'}));expect(p.onSubmit).not.toHaveBeenCalled();
  for(const letter of 'APPL')fireEvent.keyDown(window,{key:letter.toLowerCase()});
  fireEvent.click(screen.getByRole('button',{name:'E'}));
  fireEvent.click(screen.getByRole('button',{name:'Enter'}));
  expect(p.onSubmit).toHaveBeenCalledWith('APPLE');
  expect(screen.getByText('+1000')).toBeTruthy();
  expect(screen.queryByText('Opponent')).toBeNull();
  expect(screen.getByRole('button',{name:'Abandon'})).toBeTruthy();
});

const stone:FiveAliveGuess={word:'STONE',feedback:['absent','absent','present','absent','correct']};
const ample:FiveAliveGuess={word:'AMPLE',feedback:['correct','absent','correct','correct','correct']};
it.each(['arcade','async'] as const)('keeps %s keyboard and geometry stable until a completed row finishes revealing',mode=>{
 for(const solved of [false,true]){
  const done=vi.fn(),p={...props(),mode,onRevealComplete:done};
  const guesses:FiveAliveGuess[]=solved?[{word:'APPLE',feedback:Array(5).fill('correct')}]:Array(6).fill(stone);
  const current={completed:true,guesses},reveal={id:'completion',row:guesses.length-1};
  const ui=render(<FiveAliveBoard {...p} current={current} reveal={reveal}/>);
  for(let column=0;column<5;column++){
   expect(screen.getByLabelText('Keyboard')).toBeTruthy();
   expect((screen.getByRole('button',{name:'Enter'}) as HTMLButtonElement).disabled).toBe(true);
   expect(ui.container.querySelector('section.five-alive')!.hasAttribute('data-finished')).toBe(false);
   fireEvent.keyDown(window,{key:'Enter'});expect(p.onSubmit).not.toHaveBeenCalled();
   const tile=ui.container.querySelector('[data-reveal=close]')!;
   endAnimation(tile,'five-alive-flip-close');expect(done).not.toHaveBeenCalled();
   endAnimation(tile,'five-alive-flip-open');
  }
  expect(done).toHaveBeenCalledExactlyOnceWith('completion');
  ui.rerender(<FiveAliveBoard {...p} current={current}/>);
  expect(screen.queryByLabelText('Keyboard')).toBeNull();
  expect(ui.container.querySelector('section.five-alive')!.getAttribute('data-finished')).toBe('true');
  ui.unmount();
 }
});
it('flips exactly one tile at a time and commits each actual color before starting the next',()=>{
  const wrong=vi.fn(),done=vi.fn(),p={...props(),onWrongGuess:wrong,onRevealComplete:done};
  const {rerender,container}=render(<FiveAliveBoard {...p}/>);
  rerender(<FiveAliveBoard {...p} reveal={{id:'guess-1',row:0}} current={{completed:false,nextBase:700,guesses:[stone]}}/>);
  const tiles=[...container.querySelectorAll('.five-alive-row:first-child .five-alive-tile')];
  expect(tiles.map(tile=>tile.textContent).join('')).toBe('STONE');
  expect(tiles.map(tile=>tile.getAttribute('data-color'))).toEqual(['','','','','']);
  expect(screen.getByRole('button',{name:'E'}).getAttribute('data-color')).toBe('');
  expect(screen.queryByText('+700')).toBeNull();
  for(let i=0;i<5;i++){
    expect(container.querySelectorAll('[data-reveal]')).toHaveLength(1);
    expect(tiles[i].getAttribute('data-reveal')).toBe('close');
    endAnimation(tiles[i],'unrelated-animation');
    expect(tiles[i].getAttribute('data-color')).toBe('');
    endAnimation(tiles[i],'five-alive-flip-close');
    expect(tiles[i].getAttribute('data-reveal')).toBe('open');
    expect(tiles.map(tile=>tile.getAttribute('data-color'))).toEqual(stone.feedback.map((color,column)=>column<=i?color:''));
    expect(done).not.toHaveBeenCalled();
    endAnimation(tiles[i],'five-alive-flip-open');
  }
  expect(done).toHaveBeenCalledExactlyOnceWith('guess-1');expect(wrong).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button',{name:'E'}).getAttribute('data-color')).toBe('correct');
  endAnimation(tiles[4],'five-alive-flip-open');expect(done).toHaveBeenCalledTimes(1);
  rerender(<FiveAliveBoard {...p} current={{completed:false,nextBase:700,guesses:[stone]}}/>);
  expect(screen.getByText('+700')).toBeTruthy();
  expect(tiles.map(tile=>tile.textContent).join('')).toBe('STONE');
  expect(tiles.map(tile=>tile.getAttribute('data-color'))).toEqual(stone.feedback);
});

it('retains multiple completed guesses on restoration and while the next row is typed',()=>{
  const {container,rerender}=render(<FiveAliveBoard {...props()} current={{completed:false,nextBase:490,guesses:[stone,ample]}}/>);
  const rows=()=>[...container.querySelectorAll('.five-alive-row')];
  expect(rows().slice(0,2).map(row=>row.querySelector('.five-alive-tiles')?.textContent)).toEqual(['STONE','AMPLE']);
  expect([...rows()[1].querySelectorAll('.five-alive-tile')].map(tile=>tile.getAttribute('data-color'))).toEqual(ample.feedback);
  expect(container.querySelector('[data-reveal]')).toBeNull();
  fireEvent.keyDown(window,{key:'B'});
  expect(rows()[2].textContent).toContain('B');
  expect(rows()[0].textContent).toBe('STONE');
  rerender(<FiveAliveBoard {...props()} round={2} current={{completed:false,nextBase:1000,guesses:[]}}/>);
  expect(container.querySelector('.five-alive-grid')?.textContent).toBe('+1000');
});

it('retains the owner’s completed guesses while waiting in Async without admitting keyboard input',()=>{
  render(<FiveAliveBoard {...props()} mode="async" current={{completed:true,waiting:true,guesses:[stone,ample]}}/>);
  expect(screen.queryByRole('button',{name:'Abandon'})).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Waiting');
  expect(screen.getByLabelText('Guess board').textContent).toBe('STONEAMPLE');
  expect(screen.queryByLabelText('Keyboard')).toBeNull();
});

it('finishes all feedback before exploding the old helper, then drops the next helper before admitting input',()=>{
 const wrong=vi.fn(),bink=vi.fn(),done=vi.fn();
 const {container,rerender}=render(<FiveAliveBoard {...props()} onWrongGuess={wrong} onHelperDrop={bink} onRevealComplete={done}
  reveal={{id:'row',row:0,helper:{base:1000,nextBase:700}}} current={{completed:false,nextBase:700,guesses:[stone]}}/>);
 expect(screen.getByText('+1000')).toBeTruthy();expect(screen.queryByText('+700')).toBeNull();
 for(let i=0;i<5;i++){
  const tile=container.querySelector('[data-reveal=close]')!;
  expect(container.querySelector('[data-helper=burst]')).toBeNull();expect(wrong).not.toHaveBeenCalled();
  endAnimation(tile,'five-alive-flip-close');endAnimation(tile,'five-alive-flip-open');
 }
 expect(wrong).toHaveBeenCalledTimes(1);expect(bink).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();
 const burst=container.querySelector('[data-helper=burst]')!;expect(burst).toBeTruthy();
 endAnimation(burst,'unrelated');expect(bink).not.toHaveBeenCalled();
 endAnimation(burst,'five-alive-helper-burst');expect(bink).toHaveBeenCalledTimes(1);expect(done).not.toHaveBeenCalled();
 expect(screen.queryByText('+1000')).toBeNull();expect(screen.getByText('+700')).toBeTruthy();
 expect((screen.getByRole('button',{name:'A'}) as HTMLButtonElement).disabled).toBe(true);
 endAnimation(container.querySelector('[data-helper=drop]')!,'five-alive-helper-drop');expect(done).toHaveBeenCalledExactlyOnceWith('row');
 rerender(<FiveAliveBoard {...props()} current={{completed:false,nextBase:700,guesses:[stone]}}/>);
 expect((screen.getByRole('button',{name:'A'}) as HTMLButtonElement).disabled).toBe(false);
 expect([...container.querySelectorAll('.five-alive-row:first-child .five-alive-tile')].map(tile=>tile.textContent).join('')).toBe('STONE');
});

it('uses the approved Words placement cue only for letters committed into an editable tile',()=>{
 const p=props(),{container,rerender}=render(<FiveAliveBoard {...p}/>);
 expect(presentSound).not.toHaveBeenCalled();
 for(const key of 'APPLE')fireEvent.keyDown(window,{key});
 expect(presentSound).toHaveBeenCalledTimes(5);
 expect(presentSound.mock.calls.map(call=>[call[0],call[2].textContent])).toEqual([... 'APPLE'].map(letter=>['peg',letter]));
 expect(new Set(presentSound.mock.calls.map(call=>call[1])).size).toBe(5);
 fireEvent.keyDown(window,{key:'X'});fireEvent.keyDown(window,{key:'Backspace'});expect(presentSound).toHaveBeenCalledTimes(5);
 fireEvent.click(screen.getByRole('button',{name:'E'}));expect(presentSound).toHaveBeenCalledTimes(6);
 rerender(<FiveAliveBoard {...p} pending/>);fireEvent.keyDown(window,{key:'A'});expect(presentSound).toHaveBeenCalledTimes(6);
 rerender(<FiveAliveBoard {...p} round={2} current={{completed:false,nextBase:490,guesses:[stone,ample]}}/>);
 expect(presentSound).toHaveBeenCalledTimes(6);expect(container.querySelector('[data-reveal]')).toBeNull();
});

it('uses the approved card flip once per tile at the feedback opening edge, with a stable reveal identity',()=>{
 const {container,rerender}=render(<FiveAliveBoard {...props()} reveal={{id:'receipt',row:0}} current={{completed:false,nextBase:700,guesses:[stone]}}/>);
 const start=(element:Element,name:string)=>{const event=new Event('webkitAnimationStart',{bubbles:true});Object.defineProperty(event,'animationName',{value:name});fireEvent(element,event);};
 for(let column=0;column<5;column++){
  const tile=container.querySelector('[data-reveal=close]')!;
  start(tile,'unrelated');expect(presentSound).toHaveBeenCalledTimes(column);
  start(tile,'five-alive-flip-close');expect(presentSound).toHaveBeenCalledTimes(column);
  endAnimation(tile,'five-alive-flip-close');start(tile,'five-alive-flip-open');expect(presentSound).toHaveBeenLastCalledWith('flip',`five-alive:flip:receipt:0:${column}`,tile.parentElement);expect(presentSound).toHaveBeenCalledTimes(column+1);
  endAnimation(tile,'five-alive-flip-open');
 }
 rerender(<FiveAliveBoard {...props()} current={{completed:false,nextBase:700,guesses:[stone]}}/>);
 expect(presentSound).toHaveBeenCalledTimes(5);
});
