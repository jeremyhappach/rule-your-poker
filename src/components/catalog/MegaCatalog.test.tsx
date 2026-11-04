// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn()}));
import {DealerGamePicker} from './DealerGamePicker';
import {RulesContent} from '../rules/RulesContent';
import {arcadeRequest} from '@/lib/arcade/client';
afterEach(cleanup);
it('offers live Mega under Other only with qualified roster and capability',()=>{render(<DealerGamePicker roster={{players:2,humans:2}} access={{'mega-card-golf':true}} onSelect={vi.fn()}/>);fireEvent.mouseDown(screen.getByRole('tab',{name:'Other'}),{button:0,ctrlKey:false});expect(screen.getByText('Mega Card Golf')).toBeTruthy();});
it('renders frozen Mega rules without querying another game lifecycle',async()=>{render(<RulesContent game="mega-card-golf" mode="arcade"/>);await screen.findByText(/Choose the opening cards/);expect(arcadeRequest).not.toHaveBeenCalled();});
