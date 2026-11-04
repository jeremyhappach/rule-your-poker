// @vitest-environment jsdom
import {describe,expect,it,vi} from 'vitest';
vi.mock('./accountAccess',()=>({accountRpc:vi.fn()}));
import {detectMobile,isFreshMobileEntry} from './mobileOnboarding';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const android='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
describe('supported mobile platforms',()=>{
 it('selects iPhone and Android independently of standalone state',()=>{expect(detectMobile(iphone)).toMatchObject({platform:'iphone',supported:true});expect(detectMobile(android)).toMatchObject({platform:'android',supported:true});});
 it('handles desktop iPad identification and Chrome on iOS',()=>{expect(detectMobile('Version/18.0 Safari/605','MacIntel',5).supported).toBe(true);expect(detectMobile(iphone.replace('Version/18.0','CriOS/130'))).toMatchObject({chromeIOS:true,supported:true});});
 it('excludes desktop and embedded browsers',()=>{expect(detectMobile('Windows Chrome/130 Safari/537').supported).toBe(false);expect(detectMobile(android+'; wv)').supported).toBe(false);expect(detectMobile(iphone+' Instagram').supported).toBe(false);});
});
const entry={supported:true,standalone:false,path:'/',search:'',hash:'',navigation:'navigate',discarded:false,redirect:false};
describe('fresh-entry admission',()=>{
 it('admits restored authentication on a fresh lobby or login entry',()=>{expect(isFreshMobileEntry(entry)).toBe(true);expect(isFreshMobileEntry({...entry,path:'/auth'})).toBe(true);});
 it.each([{supported:false},{standalone:true},{navigation:'reload'},{navigation:'back_forward'},{discarded:true},{redirect:true},{path:'/game/existing'},{path:'/delayed/match/turn'},{path:'/arcade/run21/run/run'},{search:'?adminPlayer=id'},{hash:'#recovery'}])('does not consume an ineligible entry %o',patch=>{expect(isFreshMobileEntry({...entry,...patch})).toBe(false);});
});
