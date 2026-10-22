// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach} from 'vitest';
import {renderHook,act,waitFor,cleanup} from '@testing-library/react';
const db=vi.hoisted(()=>({rows:new Map([['one',true],['two',false]])}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:(_key:string,id:string)=>({maybeSingle:async()=>({data:{canasta_helpers:db.rows.get(id)}})})}),update:(value:{canasta_helpers:boolean})=>({eq:async(_key:string,id:string)=>{db.rows.set(id,value.canasta_helpers);return {error:null};}})})}}));
import {useCanastaHelpers} from './useCanastaHelpers';afterEach(cleanup);
describe('Canasta personal help',()=>{it('persists independently per user across reconnect without match settings',async()=>{const one=renderHook(()=>useCanastaHelpers('one')),two=renderHook(()=>useCanastaHelpers('two'));await waitFor(()=>expect(two.result.current.helpers).toBe(false));await act(()=>one.result.current.setHelpers(false));expect(db.rows.get('one')).toBe(false);expect(db.rows.get('two')).toBe(false);one.unmount();const reconnect=renderHook(()=>useCanastaHelpers('one'));await waitFor(()=>expect(reconnect.result.current.helpers).toBe(false));await act(()=>two.result.current.setHelpers(true));expect(reconnect.result.current.helpers).toBe(false);});});
