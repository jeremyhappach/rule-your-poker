// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AdminBoardUndo} from './AdminBoardUndo';
const mock=vi.hoisted(()=>({admin:true,rpc:vi.fn()}));
vi.mock('@/hooks/useIsAdmin',()=>({useIsAdmin:()=>({isAdmin:mock.admin,loading:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
const props={userId:'admin',mode:'async' as const,game:'ptown-words' as const,id:'child'};
beforeEach(()=>{mock.admin=true;mock.rpc.mockReset();});afterEach(cleanup);
describe('admin board undo',()=>{
 it('has no affordance or RPC calls for regular players',()=>{mock.admin=false;render(<AdminBoardUndo {...props}/>);expect(screen.queryByText('Admin undo')).toBeNull();expect(mock.rpc).not.toHaveBeenCalled();});
 it('inspects fresh authority before offering a timeout restore',async()=>{mock.rpc.mockResolvedValue({data:{available:true,revision:13,kind:'timeout',sessionId:'match'}});render(<AdminBoardUndo {...props}/>);expect(mock.rpc).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Admin undo'));await screen.findByText('Undo timeout');expect(mock.rpc).toHaveBeenCalledWith('admin_board_undo_info',{p_mode:'async',p_game:'ptown-words',p_id:'child'});});
 it('explains missing historical state without an action',async()=>{mock.rpc.mockResolvedValue({data:{available:false,reason:'Saved state unavailable for this older move.',revision:13}});render(<AdminBoardUndo {...props}/>);fireEvent.click(screen.getByText('Admin undo'));await screen.findByText('Saved state unavailable for this older move.');expect(screen.queryByText('Undo move')).toBeNull();});
 it('keeps one request and expected revision after an uncertain response',async()=>{mock.rpc.mockResolvedValueOnce({data:{available:true,revision:13,kind:'move',sessionId:'match'}}).mockResolvedValue({error:{message:'Connection lost'}});render(<AdminBoardUndo {...props}/>);fireEvent.click(screen.getByText('Admin undo'));fireEvent.click(await screen.findByText('Undo move'));await screen.findByText('Connection lost');const first=mock.rpc.mock.calls[1];fireEvent.click(screen.getByText('Retry undo'));await waitFor(()=>expect(mock.rpc).toHaveBeenCalledTimes(3));expect(mock.rpc.mock.calls[2]).toEqual(first);expect(first[1]).toMatchObject({p_revision:13,p_id:'child',p_mode:'async',p_game:'ptown-words'});expect(first[1].p_request).toMatch(/^[a-f0-9-]{36}$/);});
});
