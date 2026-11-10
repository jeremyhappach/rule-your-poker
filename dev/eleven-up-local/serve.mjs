import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
export async function serve(){
 const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/lib/audio/platformAudio',replacement:resolve('dev/eleven-up-local/audio.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5198,strictPort:true}});
 await server.listen();return server;
}
if(process.argv[1]?.endsWith('serve.mjs')){await serve();console.log('Local-only 11 Up review: http://127.0.0.1:5198/dev/eleven-up-local/index.html');}
