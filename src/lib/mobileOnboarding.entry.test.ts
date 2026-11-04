// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./accountAccess',()=>({accountRpc:vi.fn()}));
const chrome='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1';
let navigation='reload',standalone=false;
beforeEach(()=>{
 vi.resetModules();sessionStorage.clear();navigation='reload';standalone=false;
 history.replaceState({},'','/auth');
 Object.defineProperty(navigator,'userAgent',{configurable:true,value:chrome});
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 Object.defineProperty(performance,'getEntriesByType',{configurable:true,value:()=>[{type:navigation}]});
 vi.stubGlobal('matchMedia',()=>({matches:standalone}));
});
it('admits iPhone Chrome after build refresh and first login without a preceding logout',async()=>{
 const entry=await import('./mobileOnboarding');entry.onboardingAuthEvent('INITIAL_SESSION');entry.onboardingAuthEvent('SIGNED_IN');
 expect(entry.claimOnboardingEntry('a')).toBe(true);
});
it('suppresses only an actually presented tutorial on a same-tab reload',async()=>{
 let entry=await import('./mobileOnboarding');expect(entry.claimOnboardingEntry('a')).toBe(true);expect(entry.claimOnboardingEntry('a')).toBe(true);
 entry.consumeOnboardingEntry('a');expect(entry.claimOnboardingEntry('a')).toBe(false);
 vi.resetModules();entry=await import('./mobileOnboarding');expect(entry.claimOnboardingEntry('a')).toBe(false);expect(entry.claimOnboardingEntry('b')).toBe(true);
});
it('does not let a desktop-first login consume later mobile eligibility',async()=>{
 Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Windows Chrome/130 Safari/537'});
 const desktop=await import('./mobileOnboarding');expect(desktop.claimOnboardingEntry('a')).toBe(false);expect(sessionStorage.length).toBe(0);
 Object.defineProperty(navigator,'userAgent',{configurable:true,value:chrome});vi.resetModules();
 const mobile=await import('./mobileOnboarding');mobile.onboardingAuthEvent('INITIAL_SESSION');expect(mobile.claimOnboardingEntry('a')).toBe(true);
});
it('retains standalone and recovered-route exclusions after a refresh',async()=>{
 standalone=true;let entry=await import('./mobileOnboarding');expect(entry.claimOnboardingEntry('a')).toBe(false);
 standalone=false;history.replaceState({},'','/game/existing');vi.resetModules();entry=await import('./mobileOnboarding');expect(entry.claimOnboardingEntry('a')).toBe(false);
});
it('does not rearm on foreground sign-in callbacks or route returns',async()=>{
 const entry=await import('./mobileOnboarding');entry.cancelOnboardingEntry();entry.onboardingAuthEvent('SIGNED_IN');expect(entry.claimOnboardingEntry('a')).toBe(false);
});
it('allows a fresh navigate entry after a same-tab presentation',async()=>{
 let entry=await import('./mobileOnboarding');entry.consumeOnboardingEntry('a');navigation='navigate';vi.resetModules();entry=await import('./mobileOnboarding');expect(entry.claimOnboardingEntry('a')).toBe(true);
});
