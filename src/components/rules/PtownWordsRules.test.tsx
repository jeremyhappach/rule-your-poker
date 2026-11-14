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
it('explains five-minute new live and async turns while preserving three-minute banks',()=>{
 const ui=render(<PtownWordsRules version="ptown-words/4"/>);
 expect(screen.getByText(/Five minutes per turn/)).toBeTruthy();
 expect(screen.getByText(/add three minutes each/)).toBeTruthy();
 ui.rerender(<PtownWordsRules version="ptown-words/4" mode="async"/>);
 expect(screen.getByText(/separate five-minute clock/)).toBeTruthy();
 expect(screen.getByText(/36-hour availability window/)).toBeTruthy();
});
it('keeps the rules text accurate for frozen historical versions',()=>{
 const ui=render(<PtownWordsRules version="ptown-words/2"/>);
 expect(screen.getByText(/Three minutes per turn/)).toBeTruthy();
 ui.rerender(<PtownWordsRules version="ptown-words/2" mode="async"/>);
 expect(screen.getByText(/separate three-minute clock/)).toBeTruthy();
 ui.rerender(<PtownWordsRules version="ptown-words/3" mode="async"/>);
 expect(screen.getByText(/without a separate active-turn clock/)).toBeTruthy();
 expect(screen.queryByText(/add three minutes each/)).toBeNull();
});
