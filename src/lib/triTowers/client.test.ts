import {it,expect,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {acceptSnapshot} from './client';
import {create,project} from './referenceEngine';
const p=project(create({sessionId:'s',dealerGameId:'d',roundId:'r'},[{id:'1',userId:'u',name:'A',seat:1},{id:'2',userId:'v',name:'B',seat:2}],Array.from({length:52},(_,i)=>i),0),'1',2);
it('rejects stale and wrong-game snapshots',()=>{expect(acceptSnapshot(p,{...p,revision:1},'d')).toBe(p);expect(acceptSnapshot(null,p,'other')).toBeNull();});
it('accepts equal semantic snapshots and rejects equal revision disagreement',()=>{expect(acceptSnapshot(p,{...p,serverAt:10},'d')?.serverAt).toBe(10);expect(()=>acceptSnapshot(p,{...p,score:999},'d')).toThrow('Conflicting');});
