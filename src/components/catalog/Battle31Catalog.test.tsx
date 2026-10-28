// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn()}));
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import {RulesContent} from '../rules/RulesContent';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('renders frozen Battle 31 help without entering Arcade or requesting a leaderboard',async()=>{
 render(<RulesContent game="battle-31"/>);
 await screen.findByText('Ptown · battle-31/1');
 expect(screen.getByText(/default turn duration is 30 seconds/)).toBeTruthy();
 expect(arcadeRequest).not.toHaveBeenCalled();expect(supabase.rpc).not.toHaveBeenCalled();
});
it('refuses to substitute current help for a different Battle 31 version',async()=>{
 render(<RulesContent game="battle-31" version="battle-31/unknown"/>);
 await screen.findByRole('alert');expect(screen.queryByText('Ptown · battle-31/1')).toBeNull();
 expect(arcadeRequest).not.toHaveBeenCalled();
});
