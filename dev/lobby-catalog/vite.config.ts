import {defineConfig} from 'vite';import react from '@vitejs/plugin-react-swc';import path from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:path.resolve('dev/lobby-catalog/mockSupabase.ts')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5187,strictPort:true}});
