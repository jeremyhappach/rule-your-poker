// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn()}));
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import {findGame,eligibility,ARCADE_GAMES} from '@/lib/gameCatalog';
import {RulesContent} from '../rules/RulesContent';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('allows exactly two fake-money participants behind the capability and excludes Arcade',()=>{
 const game=findGame('canasta')!;
 expect(ARCADE_GAMES.some(g=>g.id==='canasta')).toBe(false);
 for(const humans of [1,2])expect(eligibility(game,{players:2,humans,realMoney:false},{canasta:true})).toBeNull();
 for(const realMoney of [true,undefined])expect(eligibility(game,{players:2,humans:2,realMoney},{canasta:true})).toBe('Fake money only');
 for(const players of [1,3])expect(eligibility(game,{players,humans:1,realMoney:false},{canasta:true})).not.toBeNull();
 expect(eligibility(game,{players:2,humans:2,realMoney:false},{})).toBe('Currently unavailable');
});
it('renders frozen help locally without contacting Arcade or financial owners',async()=>{
 render(<RulesContent game="canasta"/>);await screen.findByText('Ptown · canasta-classic-two/1');
 expect(screen.getByText(/Beginner pacing \(180 seconds\).*configured Expert turn timer/)).toBeTruthy();expect(supabase.rpc).not.toHaveBeenCalled();expect(arcadeRequest).not.toHaveBeenCalled();
});
it('does not substitute current Canasta help for a historical unknown version',async()=>{
 render(<RulesContent game="canasta" version="canasta-classic-two/unknown"/>);await screen.findByRole('alert');
 expect(screen.queryByText('Ptown · canasta-classic-two/1')).toBeNull();expect(arcadeRequest).not.toHaveBeenCalled();
});
