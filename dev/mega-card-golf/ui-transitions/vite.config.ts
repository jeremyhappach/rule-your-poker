import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
const root=path.resolve(__dirname,'../../..');
export default defineConfig({root,envDir:__dirname,cacheDir:path.join(__dirname,'cache.local'),plugins:[react()],resolve:{alias:[
 {find:'@/integrations/supabase/client',replacement:path.join(root,'dev/lobby-catalog/mockSupabase.ts')},
 {find:'@',replacement:path.join(root,'src')}
]},server:{host:'127.0.0.1',port:5198,strictPort:true,open:false}});
