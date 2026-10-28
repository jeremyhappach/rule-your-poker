import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import {incidentAuthority} from './authority';
export default defineConfig({plugins:[react(),incidentAuthority()],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:path.resolve('e2e/incidents/localClient.ts')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5180,strictPort:true},define:{__BUILD_HASH__:JSON.stringify('local-incident'),__BUILD_TIMESTAMP__:JSON.stringify('local'),__APP_BUILD_SHA__:JSON.stringify('local'),__APP_BUILD_TIMESTAMP__:JSON.stringify('local'),__APP_DEPLOYMENT_ID__:JSON.stringify('local'),__RUN21_APP_TEST_LANE__:false}});
