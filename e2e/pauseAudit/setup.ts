import {vi,afterEach,expect} from 'vitest';
// No real endpoint may be reached by this component/hook characterization lane.
vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(Error('Network forbidden in pause component lane'))));
afterEach(()=>{expect(fetch).not.toHaveBeenCalled();sessionStorage.clear();});
