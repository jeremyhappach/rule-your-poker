// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn()}));
import {DealerGamePicker} from './DealerGamePicker';
import {RulesContent} from '../rules/RulesContent';
import {arcadeRequest} from '@/lib/arcade/client';
afterEach(cleanup);
it('never offers Arcade-only Mega in multiplayer even when its capability is available',()=>{render(<DealerGamePicker roster={{players:1,humans:1}} access={{'mega-card-golf':true}} onSelect={vi.fn()}/>);expect(screen.queryByText('Mega Card Golf')).toBeNull();});
it('renders frozen Mega rules without querying another game lifecycle',async()=>{render(<RulesContent game="mega-card-golf" mode="arcade"/>);await screen.findByText(/Choose the opening cards/);expect(arcadeRequest).not.toHaveBeenCalled();});
