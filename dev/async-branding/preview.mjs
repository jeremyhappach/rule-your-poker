import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
const server=await createServer({configFile:false,envFile:false,cacheDir:'dev/async-branding/cache.local',plugins:[react(),{name:'branding-fixture',configureServer(s){
  s.middlewares.use(async(req,res,next)=>{
    if(!['/brands','/delayed'].some(path=>req.url?.startsWith(path)))return next();
    const html=await s.transformIndexHtml(req.url,'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Async branding local review</title></head><body><div id="root"></div><script type="module" src="/dev/async-branding/main.tsx"></script></body></html>');
    res.setHeader('Content-Type','text/html');res.end(html);
  });
}}],resolve:{alias:[
  {find:'@/hooks/useAuthGuard',replacement:resolve('dev/async-branding/auth.ts')},
  {find:'@/integrations/supabase/client',replacement:resolve('dev/async-branding/fixture.ts')},
  {find:'@',replacement:resolve('src')},
]},server:{host:'127.0.0.1',port:5194,strictPort:true}});
await server.listen();console.log('Local synthetic async review: http://127.0.0.1:5194/delayed/00000000-0000-4000-8000-000000000003');
