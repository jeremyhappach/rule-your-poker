// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {QuintzeeBonuses} from './QuintzeeBonuses';
import {QUINTZEE_CATEGORIES,type QuintzeeRules,type QuintzeeResult,type QuintzeeBoard} from '@/lib/quintzee/model';
const rules={upperBonus:35,upperThreshold:63,clearBonus:35} as QuintzeeRules;
const lowUpper={ones:1,twos:2,threes:3,fours:4,fives:5,sixes:6};
const fullUpper={ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18};
const full=Object.fromEntries(QUINTZEE_CATEGORIES.map(c=>[c,10]));
const state=(c:HTMLElement,kind:string)=>c.querySelector('.q-'+kind+'-bonus')?.getAttribute('data-earned');
afterEach(cleanup);
it('preserves the existing permitted upper subtotal without resolving unrevealed opponent objectives',()=>{
 const {container}=render(<QuintzeeBonuses rules={rules} scores={{fours:20,fives:25,sixes:18,ones:0}} result={null} showOutcomes={false}/>);
 expect(container.querySelector('[data-upper-progress]')?.textContent).toBe('63/63');expect(state(container,'upper')).toBeNull();expect(state(container,'filled')).toBeNull();
 expect(container.querySelector('[data-upper-pace]')).toBeNull();
});
it.each([{scores:{fives:20},pace:'+5'},{scores:{fives:20,threes:6,ones:0},pace:'-1'},{scores:{ones:3,twos:6},pace:'0'},{scores:{fours:20,fives:25,sixes:18},pace:'+18'}])('uses the shared Yahtzee pace for committed scores: $pace',({scores,pace})=>{
 const {container}=render(<QuintzeeBonuses rules={rules} scores={scores} result={null}/>);expect(container.querySelector('[data-upper-pace]')?.textContent).toBe(pace);
});
it('keeps pace pending when Yahtzee would infer impossibility, then hides on actual Quintzee upper failure',()=>{
 const scores={twos:3,threes:9,fours:12,fives:15,sixes:18};const h=render(<QuintzeeBonuses rules={rules} scores={scores} result={null}/>);
 expect(state(h.container,'upper')).toBeNull();expect(h.container.querySelector('[data-upper-pace]')?.textContent).toBe('-3');
 h.rerender(<QuintzeeBonuses rules={rules} scores={{...scores,ones:0}} result={null}/>);expect(state(h.container,'upper')).toBe('false');expect(h.container.querySelector('[data-upper-pace]')).toBeNull();
});
it('pending does not confuse missing categories with committed zeros or infer early failure',()=>{
 const {container}=render(<QuintzeeBonuses rules={rules} scores={{ones:1,twos:2,threes:3,fours:4,fives:5}} result={null}/>);
 expect(state(container,'upper')).toBeNull();expect(state(container,'filled')).toBeNull();expect(container.querySelectorAll('em')).toHaveLength(2);
});
it('upper reaches threshold before the upper section is complete',()=>{
 const {container}=render(<QuintzeeBonuses rules={rules} scores={{fours:20,fives:25,sixes:18}} result={null}/>);
 expect(state(container,'upper')).toBe('true');expect(state(container,'filled')).toBeNull();expect(container.querySelector('.q-upper-bonus em')?.textContent).toBe('= +35');
});
it.each([true,false])('last upper category resolves independently with lower categories pending: %s',passed=>{
 const scores=passed?fullUpper:lowUpper,{container}=render(<QuintzeeBonuses rules={rules} scores={scores} result={null}/>);
 expect(state(container,'upper')).toBe(String(passed));expect(state(container,'filled')).toBeNull();expect(!!container.querySelector('.q-upper-bonus em')).toBe(passed);
});
it('first committed zero fails Fill All immediately and survives later commits and reentry',()=>{
 const first={ones:0},props={rules,scores:first,result:null};const h=render(<QuintzeeBonuses {...props}/>);
 expect(state(h.container,'filled')).toBe('false');expect(h.container.querySelector('.q-filled-bonus em')).toBeNull();
 const later={...first,twos:6,sixes:18};h.rerender(<QuintzeeBonuses {...props} scores={later}/>);expect(state(h.container,'filled')).toBe('false');h.unmount();
 const fresh=render(<QuintzeeBonuses {...props} scores={later}/>);expect(state(fresh.container,'filled')).toBe('false');
});
it('Fill All remains pending until every category is committed positive',()=>{
 const scores:QuintzeeBoard['scores']={...full};delete scores.chance;
 const h=render(<QuintzeeBonuses rules={rules} scores={scores} result={null}/>);expect(state(h.container,'filled')).toBeNull();
 h.rerender(<QuintzeeBonuses rules={rules} scores={full} result={null}/>);expect(state(h.container,'filled')).toBe('true');
});
it.each([0,55])('preserves configured fill bonus %s including Classic zero-value achievement',value=>{
 const {container}=render(<QuintzeeBonuses rules={{...rules,clearBonus:value}} scores={{...full,...lowUpper}} result={{reason:'all_categories'} as QuintzeeResult}/>);
 expect(state(container,'filled')).toBe('true');expect(container.querySelector('.q-filled-bonus em')?.textContent).toBe('= +'+value);expect(container.querySelector('.q-upper-bonus em')).toBeNull();
});
it('respects configured upper threshold and amount and closes unresolved objectives on terminal result',()=>{
 const custom={...rules,upperThreshold:10,upperBonus:25} as unknown as QuintzeeRules;
 const h=render(<QuintzeeBonuses rules={custom} scores={{sixes:12}} result={null}/>);expect(state(h.container,'upper')).toBe('true');expect(h.container.querySelector('.q-upper-bonus em')?.textContent).toBe('= +25');
 h.rerender(<QuintzeeBonuses rules={rules} scores={{ones:1}} result={{reason:'timeout'} as QuintzeeResult}/>);expect(state(h.container,'upper')).toBe('false');expect(state(h.container,'filled')).toBe('false');
});
