// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {QuintzeeBonuses} from './QuintzeeBonuses';
import type {QuintzeeRules,QuintzeeResult} from '@/lib/quintzee/model';
afterEach(cleanup);
it.each([0,55])('preserves configured fill bonus %s, including a zero-value achievement',value=>{
 const {container}=render(<QuintzeeBonuses rules={{upperBonus:35,upperThreshold:63,clearBonus:value} as QuintzeeRules} upper={60} result={{reason:'all_categories',upperBonus:0,clearBonus:value} as QuintzeeResult}/>);
 expect(container.querySelector('.q-filled-bonus')?.getAttribute('data-earned')).toBe('true');expect(container.querySelector('.q-filled-bonus em')?.textContent).toBe('= +'+value);expect(container.querySelector('.q-upper-bonus em')).toBeNull();
});
