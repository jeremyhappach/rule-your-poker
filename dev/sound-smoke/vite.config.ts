import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)),repo=fileURLToPath(new URL('../..',import.meta.url));
export default defineConfig({root,envDir:repo,publicDir:false,plugins:[react()],resolve:{alias:[
 {find:'@/lib/audio/platformAudio',replacement:repo+'/dev/sound-studio-v2/labAudio.ts'},
 {find:'@',replacement:repo+'/src'},
]},server:{host:'0.0.0.0',port:4320,strictPort:true,fs:{allow:[repo]}},build:{outDir:repo+'/qualification.local/sound-smoke/site',emptyOutDir:true}});
