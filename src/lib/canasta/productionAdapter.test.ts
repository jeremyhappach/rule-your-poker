import {describe,it,expect,vi} from 'vitest';
const handler=vi.hoisted(()=>vi.fn(async()=>{}));
const create=vi.hoisted(()=>vi.fn(()=>({handler})));
vi.mock('../../../server/canasta/handler',()=>({createCanastaHandler:create}));
import {createProductionAdapter} from '../../../server/canasta/production';
import type {IncomingMessage,ServerResponse} from 'node:http';
describe('Canasta server credential admission',()=>{
 it('uses the existing server-only production project credential without changing client access',async()=>{
  create.mockClear();const run=createProductionAdapter({RUN21_SUPABASE_URL:'https://xvhmbuppghwmwpwrkzao.supabase.co',RUN21_SUPABASE_SERVICE_ROLE_KEY:'fixture-server-key'});
  await run({} as IncomingMessage,{} as ServerResponse);
  expect(create).toHaveBeenCalledWith('https://xvhmbuppghwmwpwrkzao.supabase.co','fixture-server-key');
 });
 it.each([{CANASTA_SUPABASE_URL:'https://xvhmbuppghwmwpwrkzao.supabase.co'},{RUN21_SUPABASE_URL:'https://wrong.supabase.co',RUN21_SUPABASE_SERVICE_ROLE_KEY:'fixture-key'}])('fails closed on a partial override or different project',async override=>{
  create.mockClear();const res={writeHead:vi.fn(),end:vi.fn()};
  await createProductionAdapter({RUN21_SUPABASE_URL:'https://xvhmbuppghwmwpwrkzao.supabase.co',RUN21_SUPABASE_SERVICE_ROLE_KEY:'fixture-key',...override})({} as IncomingMessage,res as unknown as ServerResponse);
  expect(res.writeHead).toHaveBeenCalledWith(503,expect.anything());expect(create).not.toHaveBeenCalled();
 });
});
