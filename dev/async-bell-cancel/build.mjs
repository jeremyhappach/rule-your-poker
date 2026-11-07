import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir','qualification.local/async-bell-cancel/app'],{env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:15414',VITE_SUPABASE_PUBLISHABLE_KEY:'local-synthetic-key',VITE_ASYNC_PUSH_ENABLED:'false'},stdio:'inherit'});
process.exit(r.status??1);

