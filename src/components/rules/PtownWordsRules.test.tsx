// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import PtownWordsRules from './PtownWordsRules';
afterEach(cleanup);
it('explains the separate active clock and banks for current async matches',()=>{
 render(<PtownWordsRules mode="async" version="ptown-words/2"/>);
 expect(screen.getByText(/Entering your playable turn starts a separate three-minute clock/)).toBeTruthy();
 expect(screen.getByText(/Two time banks per player per match/)).toBeTruthy();
 expect(screen.queryByText(/host pauses/)).toBeNull();
});
it('preserves the frozen earlier async rules',()=>{
 render(<PtownWordsRules mode="async" version="ptown-words/3"/>);
 expect(screen.getByText(/without a separate active-turn clock or banks/)).toBeTruthy();
 expect(screen.queryByText(/Two time banks/)).toBeNull();
});
