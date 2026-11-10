// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
const mocks=vi.hoisted(()=>({signup:vi.fn(),send:vi.fn(),toast:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signUp:mocks.signup}}}));
vi.mock('@/lib/accountAccess',()=>({sendVerification:mocks.send}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:mocks.toast})}));
import Auth from './Auth';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));mocks.signup.mockResolvedValue({data:{user:{id:'new-user'},session:{access_token:'signup-token'}},error:null});mocks.send.mockResolvedValue(undefined);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each([false,true])('requests independent verification after signup; visible failure=%s',async failed=>{
 if(failed)mocks.send.mockRejectedValue(Error('dispatch failed'));
 render(<MemoryRouter><Auth/></MemoryRouter>);
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Sign Up'}),{button:0,ctrlKey:false});
 fireEvent.change(await screen.findByLabelText('Email'),{target:{value:'new@example.invalid'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-password'}});
 fireEvent.submit(screen.getByRole('button',{name:'Sign Up'}).closest('form')!);
 await waitFor(()=>expect(mocks.send).toHaveBeenCalledWith('new-user',true,'signup-token'));
 if(failed)await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({description:expect.stringContaining('Resend Verification Email')})));
});
