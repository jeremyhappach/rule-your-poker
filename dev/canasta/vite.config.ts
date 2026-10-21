import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import {canastaAuthorityFixture} from './authorityPlugin';
export default defineConfig({
  root: __dirname, envDir: path.join(__dirname,'.offline-env'), plugins:[react(),canastaAuthorityFixture()],
  resolve:{alias:[
    {find:'@/lib/audio/platformAudio',replacement:path.join(__dirname,'offlineAudio.ts')},
    {find:'@/integrations/supabase/client',replacement:path.join(__dirname,'offlineSupabase.ts')},
    {find:'@',replacement:path.resolve(__dirname,'../../src')},
  ]},
  server:{host:'127.0.0.1',port:4327,strictPort:true,fs:{allow:[path.resolve(__dirname,'../..')]}},
  build:{outDir:path.resolve(__dirname,'../../dist/canasta-review'),emptyOutDir:true},
});
