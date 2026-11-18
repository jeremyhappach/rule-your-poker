import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
process.env.RUN21_SUPABASE_URL='https://xvhmbuppghwmwpwrkzao.supabase.co';
process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY='isolated-test-transport';
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.hostname==='xvhmbuppghwmwpwrkzao.supabase.co')throw Error('qualification:production_network_forbidden');
 return nativeFetch(input,init);
};
let arcade,delayed;
const transport={name:'isolated-five-alive-transport',enforce:'pre',resolveId(source,_importer,options){
 if(source==='@supabase/supabase-js'&&options?.ssr)return resolve('dev/five-alive/hosted-server-client.ts');
},configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url!=='/api/arcade'&&req.url!=='/api/delayed')return next();
 const chunks=[];for await(const chunk of req)chunks.push(chunk);req.body=JSON.parse(Buffer.concat(chunks).toString());
 return (req.url==='/api/arcade'?arcade:delayed)(req,res);
});}};
const port=Number(process.env.FIVE_ALIVE_TEST_PORT??5196);
const server=await createServer({configFile:false,plugins:[transport,react()],ssr:{noExternal:['@supabase/supabase-js']},resolve:{alias:[
 ...(process.env.FIVE_ALIVE_DEPLOYED_REPRO==='true'?[{find:'@/components/fiveAlive',replacement:resolve('qualification.local/five-alive/deployed-source')}]:[]),
 {find:'@/integrations/supabase/client',replacement:resolve('dev/five-alive/hosted-client.ts')},
 {find:'@',replacement:resolve('src')},
]},server:{host:'127.0.0.1',port,strictPort:true},optimizeDeps:{entries:['dev/five-alive/browser/index.html']},appType:'spa'});
arcade=(await server.ssrLoadModule('/api/arcade.ts')).default;
delayed=(await server.ssrLoadModule('/api/delayed.ts')).default;
await server.listen();
writeFileSync('qualification.local/five-alive/hosted/server.json',JSON.stringify({url:`http://127.0.0.1:${port}`}));
console.log(`Five Alive isolated qualification server: http://127.0.0.1:${port}`);
