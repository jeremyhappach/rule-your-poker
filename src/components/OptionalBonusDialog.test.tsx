// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {OptionalBonusDialog} from './OptionalBonusDialog';
afterEach(cleanup);
it.each(['play','skip'] as const)('sends %s without dismissing an unacknowledged decision',choice=>{
 const choose=vi.fn();const h=render(<OptionalBonusDialog decision={{actor:'winner',choice:'pending'}} actor="winner" onChoice={choose}/>);
 expect(screen.getByText('You won this game either way.')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:choice==='play'?'Play Bonus':'Skip Bonus'}));expect(choose).toHaveBeenCalledWith(choice);
 expect(screen.getByRole('alertdialog')).toBeTruthy();
 h.rerender(<OptionalBonusDialog decision={{actor:'winner',choice:'pending'}} actor="winner" disabled onChoice={choose}/>);
 fireEvent.click(screen.getByRole('button',{name:'Skip Bonus'}));expect(choose).toHaveBeenCalledOnce();
 h.rerender(<OptionalBonusDialog decision={{actor:'winner',choice}} actor="winner" onChoice={choose}/>);
 expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('does not offer a choice to the opponent or without server eligibility',()=>{
 const choose=vi.fn(),h=render(<OptionalBonusDialog decision={{actor:'winner',choice:'pending'}} actor="opponent" onChoice={choose}/>);
 expect(screen.queryByRole('alertdialog')).toBeNull();h.rerender(<OptionalBonusDialog actor="winner" onChoice={choose}/>);expect(screen.queryByRole('alertdialog')).toBeNull();
});
