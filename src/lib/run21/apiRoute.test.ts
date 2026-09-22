// @vitest-environment node
import {expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({handler:vi.fn()}));
vi.mock('../../../server/run21/production.js',()=>({createProductionAdapter:()=>mock}));
import handler from '../../../api/run21';
import type {IncomingMessage,ServerResponse} from 'node:http';
it('preserves the durable event cursor through the production rewrite',async()=>{
 const req={url:'/api/run21?run21_path=game/events&after=42'} as IncomingMessage;
 await handler(req,{} as ServerResponse);expect(req.url).toBe('/__run21/game/events?after=42');expect(mock.handler).toHaveBeenCalledWith(req,{});
});
