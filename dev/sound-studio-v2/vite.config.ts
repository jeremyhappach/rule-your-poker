import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const repo=fileURLToPath(new URL('../..',import.meta.url));
export default defineConfig({root,publicDir:false,cacheDir:repo+'/qualification.local/sound-studio-v2/vite-cache',plugins:[react()],resolve:{alias:[
 {find:'@/lib/audio/platformAudio',replacement:root+'labAudio.ts'},
 {find:'@',replacement:repo+'/src'},
]},server:{host:'0.0.0.0',port:4318,strictPort:true,fs:{allow:[repo]}},
build:{outDir:repo+'/qualification.local/sound-studio-v2/site',emptyOutDir:true}});
