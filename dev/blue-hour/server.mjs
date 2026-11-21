import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
const html='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blue Hour · local review</title></head><body><div id="root"></div><script type="module" src="/dev/blue-hour/entry.tsx"></script></body></html>';
const server=await createServer({configFile:false,cacheDir:'qualification.local/blue-hour-vite',plugins:[react(),{name:'local-blue-hour-review',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0].includes('.')||req.url?.startsWith('/@'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/blue-hour/client.ts')},{find:'@',replacement:resolve('src')}]},define:{__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"review"',__APP_BUILD_SHA__:'"blue-hour-review"',__BUILD_TIMESTAMP__:'"local"'},server:{host:'127.0.0.1',port:5198,strictPort:true,hmr:false}});
await server.listen();console.log('Blue Hour review: http://127.0.0.1:5198/?game=holm');
