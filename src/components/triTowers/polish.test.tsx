// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render} from '@testing-library/react';
import {TriTowersBoard} from './TriTowersBoard';
import {dotClock,towerAwards} from '@/lib/triTowers/polishPresentation';
import rules from '@/lib/triTowers/rules-v2.json';
vi.mock('@/components/PlayingCard',()=>({PlayingCard:({frontStyle}:any)=><span data-front={frontStyle}/> }));
globalThis.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}} as any;
afterEach(cleanup);
const board={rules,phase:'playing' as const,cards:Array(28).fill(null),removed:[2,0],waste:0,stockRemaining:17,run:0,deadline:120000,highRun:7};
describe('shared TriTowers polish',()=>{
 it('places HI-RUN above the tableau and keeps upcard, current streak, stock order',()=>{
  const ui=render(<TriTowersBoard view={board} canAct onIntent={()=>{}} result={null} roundKey="d:r:p:1" now={1000}/>);
  expect(ui.getByLabelText('Round highest streak 7')).toBeTruthy();
  expect(ui.getByLabelText('Current removal streak').textContent).toBe('0');
  const children=[...ui.container.querySelector('.tri-deck-row')!.children];expect(children.map(x=>x.className)).toEqual(['tri-waste','tri-run','tri-stock']);
  expect(ui.container.querySelector('.tri-shared-board')!.firstElementChild?.className).toBe('tri-high-run');
  expect(ui.queryByText(/BUILD HERE|Next|PEAK|CARD RUN/)).toBeNull();
  expect(ui.container.querySelectorAll('[data-front=cartoon]').length).toBeGreaterThan(0);
 });
 it('uses clear order and frozen awards, including historical configuration',()=>{
  expect(towerAwards([19,2,0,1],rules)).toEqual([{tower:2,amount:5000},{tower:0,amount:10000},{tower:1,amount:15000}]);
  expect(towerAwards([1],{...rules,peakBonuses:[123,456,789]})).toEqual([{tower:1,amount:123}]);
 });
 it('restores badges without animation and retires them at round changes',()=>{
  const props={canAct:true,onIntent:()=>{},result:null,now:1000};const ui=render(<TriTowersBoard {...props} view={board} roundKey="first"/>);
  expect(ui.container.querySelector('[data-tower-award="2"]')?.getAttribute('data-animate')).toBe('false');
  ui.rerender(<TriTowersBoard {...props} view={{...board,removed:[],highRun:0}} roundKey="bonus"/>);
  expect(ui.container.querySelectorAll('[data-tower-award]')).toHaveLength(0);expect(ui.getByLabelText('Round highest streak 0')).toBeTruthy();
 });
 it('maps only display time, preserving exact urgency boundaries and zero',()=>{
  expect(dotClock(120000,120000)).toEqual({lit:24,tone:'green'});expect(dotClock(12000,120000).tone).toBe('yellow');expect(dotClock(6000,120000).tone).toBe('red');expect(dotClock(0,120000).lit).toBe(0);
 });
});
