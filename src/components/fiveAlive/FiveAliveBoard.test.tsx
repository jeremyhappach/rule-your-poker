// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FiveAliveBoard,type FiveAliveBoardProps} from './FiveAliveBoard';

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

it('shows only waiting in Async and retains feedback colors while the wrong row poofs',()=>{
  const wrong=vi.fn(),p={...props(),mode:'async' as const,opponentScore:123,onWrongGuess:wrong};
  const {rerender,container}=render(<FiveAliveBoard {...p}/>);
  expect(screen.queryByRole('button',{name:'Abandon'})).toBeNull();
  rerender(<FiveAliveBoard {...p} current={{completed:false,nextBase:700,guesses:[{word:'STONE',feedback:['absent','absent','present','absent','correct']}]}}/>);
  expect(wrong).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.five-alive-poof')).toBeTruthy();
  expect(screen.getByRole('button',{name:'E'}).getAttribute('data-color')).toBe('correct');
  rerender(<FiveAliveBoard {...p} current={{completed:true,waiting:true}}/>);
  expect(screen.getByRole('status').textContent).toContain('Waiting');
  expect(screen.queryByLabelText('Keyboard')).toBeNull();
});
