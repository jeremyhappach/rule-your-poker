import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import {localAuthority} from '../vite.config';
const root=path.resolve(__dirname,'../../..');
const file=(p:string)=>path.join(root,p);
export default defineConfig({
 root,envDir:__dirname,cacheDir:file('dev/mega-card-golf/polish/cache.local'),
 plugins:[react(),localAuthority()],
 resolve:{alias:[
 {find:'@/integrations/supabase/client',replacement:file('dev/lobby-catalog/mockSupabase.ts')},
 {find:'@/lib/arcade/client',replacement:file('dev/mega-card-golf/polish/request.ts')},
 {find:'@/hooks/useLobbyGames',replacement:file('dev/mega-card-golf/polish/hooks.ts')},
 {find:'@/lib/debugHarness/useGlobalDebugMode',replacement:file('dev/mega-card-golf/polish/hooks.ts')},
 {find:'@',replacement:file('src')}]},
 server:{host:'127.0.0.1',port:5187,strictPort:true,open:false}
});
