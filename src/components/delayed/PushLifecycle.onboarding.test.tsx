// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
const mock=vi.hoisted(()=>({prepare:vi.fn(),reconcile:vi.fn(),target:vi.fn(),resolved:vi.fn(),setAccount:vi.fn()}));
vi.mock('@/lib/mobileOnboarding',()=>({resolveOnboardingPushEntry:mock.resolved}));
vi.mock('@/lib/webPush/browser',()=>({pushEnabled:true,prepare:mock.prepare,reconcile:mock.reconcile,pendingRegistration:mock.target,setAccount:mock.setAccount}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'a'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}}}));
import {PushLifecycle} from './PushLifecycle';
beforeEach(()=>{vi.clearAllMocks();mock.setAccount.mockResolvedValue(undefined);mock.prepare.mockResolvedValue({});mock.reconcile.mockResolvedValue(undefined);mock.target.mockResolvedValue(null);});
afterEach(cleanup);
const mount=()=>render(<MemoryRouter><PushLifecycle/></MemoryRouter>);
it('releases onboarding in an iPhone browser without push APIs',async()=>{mock.prepare.mockReturnValue(undefined);mount();await waitFor(()=>expect(mock.resolved).toHaveBeenCalledWith(null));expect(mock.target).not.toHaveBeenCalled();expect(mock.reconcile).not.toHaveBeenCalled();});
it('waits for worker navigation and excludes an administrator deep link',async()=>{mock.target.mockResolvedValue('target');mount();await waitFor(()=>expect(mock.resolved).toHaveBeenCalledWith('/?adminPlayer=target'));});
it('releases a supported browser only after reconciliation',async()=>{mount();await waitFor(()=>expect(mock.resolved).toHaveBeenCalledWith(null));expect(mock.reconcile).toHaveBeenCalled();expect(mock.target).toHaveBeenCalledWith('a');});
