// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FiveAliveBoard,type FiveAliveBoardProps,type FiveAliveGuess} from './FiveAliveBoard';
import {endAnimation} from './animationTestEvent';

afterEach(cleanup);
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
