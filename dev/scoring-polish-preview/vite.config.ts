import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)),repo=fileURLToPath(new URL('../..',import.meta.url));
export default defineConfig({root,envDir:repo,publicDir:repo+'/public',cacheDir:repo+'/qualification.local/scoring-polish/vite',plugins:[react()],
 resolve:{alias:[{find:'./platformAudio',replacement:repo+'/dev/sound-lab/labAudio.ts'},{find:'@/lib/audio/platformAudio',replacement:repo+'/dev/sound-lab/labAudio.ts'},{find:'@',replacement:repo+'/src'}]},
 server:{host:'127.0.0.1',port:4346,strictPort:true,fs:{allow:[repo]}}});
