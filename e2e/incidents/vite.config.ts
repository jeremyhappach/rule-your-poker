import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve(process.cwd(),'src')}},server:{host:'127.0.0.1',port:5179,strictPort:true},define:{__BUILD_HASH__:JSON.stringify('local-incident'),__BUILD_TIMESTAMP__:JSON.stringify('local'),__APP_BUILD_SHA__:JSON.stringify('local'),__APP_BUILD_TIMESTAMP__:JSON.stringify('local'),__APP_DEPLOYMENT_ID__:JSON.stringify('local'),__RUN21_APP_TEST_LANE__:false}});
