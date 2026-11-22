// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {WordsConnectionStatus} from './WordsConnectionStatus';
afterEach(cleanup);
it('shows an active recovery indicator, then a recoverable failure instead of an idle spinner',()=>{
 const retry=vi.fn(),ui=render(<WordsConnectionStatus connected={false} connection={{phase:'recovering'}} onReconnect={retry}/>);
 expect(screen.getByRole('status').textContent).toBe('Reconnecting…');expect(screen.queryByRole('button')).toBeNull();
 ui.rerender(<WordsConnectionStatus connected={false} connection={{phase:'failed',message:'subscription timeout'}} onReconnect={retry}/>);
 expect(screen.getByRole('alert').textContent).toContain('Could not reconnect');expect(screen.queryByText('Reconnecting…')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry'}));expect(retry).toHaveBeenCalledOnce();
 ui.rerender(<WordsConnectionStatus connected connection={{phase:'connected'}} onReconnect={retry}/>);expect(ui.container.textContent).toBe('');
});
it('allows retry of an uncertain pending command even with a healthy subscription',()=>{
 const retry=vi.fn();render(<WordsConnectionStatus connected connection={{phase:'connected'}} pending error="Connection uncertain. Reconnect to retry." onReconnect={retry}/>);
 fireEvent.click(screen.getByRole('button',{name:'Reconnect'}));expect(retry).toHaveBeenCalledOnce();
});
