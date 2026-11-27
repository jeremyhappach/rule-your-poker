// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
beforeEach(()=>{vi.resetModules();vi.stubGlobal('navigator',{setAppBadge:vi.fn().mockResolvedValue(undefined),clearAppBadge:vi.fn().mockResolvedValue(undefined)});});
afterEach(()=>vi.unstubAllGlobals());
it('sets exact counts, clears zero, ignores invalid/regressive snapshots and contains permission errors',async()=>{
 const {syncAppBadge}=await import('./appBadge');const nav=navigator as any;
 await syncAppBadge('a',{count:3,version:100});expect(nav.setAppBadge).toHaveBeenLastCalledWith(3);
 await syncAppBadge('a');expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
 await syncAppBadge('a',{count:0,version:200});expect(nav.clearAppBadge).toHaveBeenCalledTimes(2);
 await syncAppBadge('a',{count:5,version:100});expect(nav.setAppBadge).toHaveBeenCalledTimes(1);
 await syncAppBadge('a',{count:-1,version:300});expect(nav.setAppBadge).toHaveBeenCalledTimes(1);
 nav.setAppBadge.mockRejectedValueOnce(Error('Denied'));
 await expect(syncAppBadge('a',{count:4,version:300})).resolves.toBeUndefined();
 await syncAppBadge('a',{count:4,version:300});expect(nav.setAppBadge).toHaveBeenLastCalledWith(4);
 await syncAppBadge(null);expect(nav.clearAppBadge).toHaveBeenCalledTimes(3);
});
it('no-ops on unsupported browsers',async()=>{
 vi.stubGlobal('navigator',{});const {syncAppBadge}=await import('./appBadge');
 await expect(syncAppBadge('a',{count:3,version:100})).resolves.toBeUndefined();
});
