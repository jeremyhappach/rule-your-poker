// Disposable full-app adapter: production handler and build, local database only.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createRun21Handler} from '../../../../server/run21/handler';
const base=path.resolve('qualification.local/farkle-full-stack');
const status=JSON.parse(fs.readFileSync(path.join(base,'status.json'),'utf8'));
if(status.API_URL!=='http://127.0.0.1:57321')throw Error('Isolated API required');
// The deployed discovery contract contains its project hostname. Browser tests
// forward that virtual origin exclusively to the local API, including realtime.
// The publishable credential is local and cannot authorize production requests.
const env={...process.env,VITE_SUPABASE_URL:'https://xvhmbuppghwmwpwrkzao.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY};
const dist=path.join(base,'run21-dist');
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',dist],{env,encoding:'utf8',maxBuffer:16e6});
fs.writeFileSync(path.join(base,'run21-build.log'),(build.stdout??'')+'\n'+(build.stderr??''));
if(build.status!==0)throw Error('Build failed');
const runtime=createRun21Handler({url:status.API_URL,key:status.SERVICE_ROLE_KEY,loopbackOnly:true});
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/__run21/')){void runtime.handler(req,res);return;}
 const requested=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url??'/','http://local').pathname));
 if(!requested.startsWith(dist+path.sep)&&requested!==dist){res.writeHead(403).end();return;}
 const file=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
server.listen(5178,'127.0.0.1',()=>console.log('Run21 production build and authenticated handler listening on loopback 5178; API is loopback 57321.'));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{runtime.dispose();server.closeAllConnections();server.close(()=>process.exit());});
