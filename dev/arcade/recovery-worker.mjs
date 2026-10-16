import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {createServer} from 'vite';
const [database,token]=process.argv.slice(2);
if(!/^arcade_phase1_\d+$/.test(database))throw Error('local database required');
const db=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await db.connect();
const vite=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
try{const {recoverArcade}=await vite.ssrLoadModule('/server/arcade/service.ts');await recoverArcade(async(name,args)=>{const keys=Object.keys(args);return(await db.query('SELECT public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;},token);}
finally{await vite.close();await db.end();}

