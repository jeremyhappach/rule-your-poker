import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({plugins:[react()],optimizeDeps:{entries:['dev/arcade-timestamps/index.html']},define:{__RUN21_APP_TEST_LANE__:'false'},resolve:{alias:[
  {find:'@/integrations/supabase/client',replacement:path.resolve('dev/arcade-lobby/mockSupabase.ts')},
  {find:'@/components/delayed/NotificationBell',replacement:path.resolve('dev/arcade-timestamps/chrome.tsx')},
  {find:'@/components/GameplaySoundButton',replacement:path.resolve('dev/arcade-timestamps/chrome.tsx')},
  {find:'@',replacement:path.resolve('src')},
]},server:{host:'127.0.0.1',port:5196,strictPort:true}});
