import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
// No app entry, environment file, auth session, database or existing game registration.
export default defineConfig({root:path.resolve(__dirname),envDir:path.resolve(__dirname,'.offline-env'),plugins:[react()],
  resolve:{alias:[{find:'@/integrations/supabase/client',replacement:path.resolve(__dirname,'offlineSupabase.ts')},{find:'@',replacement:path.resolve(__dirname,'../../src')}]},
  server:{host:'127.0.0.1',port:4321,strictPort:true},
  build:{outDir:path.resolve(__dirname,'../../dist/run21-lab'),emptyOutDir:true}});
